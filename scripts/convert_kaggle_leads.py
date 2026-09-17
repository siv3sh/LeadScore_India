#!/usr/bin/env python3
"""Convert the Kaggle "Sample Sales CRM Data" dataset into LeadScore India's CSV schema.

Usage:
    kaggle datasets download -d sushicatsan/sample-sales-crm-data --unzip -p /tmp/kag/sf
    python3 scripts/convert_kaggle_leads.py /tmp/kag/sf test-data

Source: https://www.kaggle.com/datasets/sushicatsan/sample-sales-crm-data (CC0-1.0)

Two constraints from src/lib/ml.ts drive the mapping:

1. oneHotSource() matches only the six canonical source values, so lead_source
   has to be mapped onto them. The dataset happens to have exactly six sources,
   so the mapping is 1:1 and no signal is collapsed. Which B2B source maps to
   which D2C channel is arbitrary — only the six-way distinction matters.

2. deriveLabel() treats last_contacted_at as the conversion date: a 'won' lead
   is a positive label only if it closed within 30 days of created_at. So for
   converted leads last_contacted_at is the first real order date, which gives
   the target genuine variance instead of labelling every won lead positive.
"""

import argparse
import bisect
import collections
import csv
import os
import sys

# Arbitrary but 1:1, so all six one-hot slots stay in use.
SOURCE_MAP = {
    'Web': 'google',
    'Inbound': 'ig',
    'Outbound': 'fb',
    'Partner Referral': 'referral',
    'Event': 'walkin',
    'Trade Show': 'other',
}

# Non-converted leads keep a distinction between "went cold" and "still early".
STATUS_MAP = {
    'Qualified': 'lost',
    'Nurturing': 'no_response',
    'Working': 'no_response',
    'Open': 'unknown',
}

# Draft and Cancelled orders are not revenue.
COUNTED_ORDER_STATUSES = {'Fulfilled', 'Activated'}

OUTPUT_COLUMNS = [
    'lead_id', 'name', 'phone', 'source', 'created_at',
    'last_contacted_at', 'order_value', 'num_orders', 'status',
]


def read_csv(path):
    with open(path, newline='', encoding='utf-8') as handle:
        return list(csv.DictReader(handle))


def build_rows(src_dir):
    leads = read_csv(os.path.join(src_dir, 'lead.csv'))
    orders = read_csv(os.path.join(src_dir, 'order.csv'))
    tasks = read_csv(os.path.join(src_dir, 'tasks.csv'))

    # Roll orders up per account: total revenue, order count, sorted order dates.
    totals = collections.defaultdict(float)
    counts = collections.Counter()
    order_dates = collections.defaultdict(list)
    for order in orders:
        if order['status'] not in COUNTED_ORDER_STATUSES:
            continue
        account = order['account_id']
        totals[account] += float(order['total_amount'] or 0)
        counts[account] += 1
        if order['created_date']:
            order_dates[account].append(order['created_date'])
    for dates in order_dates.values():
        dates.sort()

    # Account orders in this dataset are not causally tied to lead creation, so
    # only events at or after created_at are usable as a contact date. Otherwise
    # leads look contacted before they existed and deriveLabel counts the
    # negative gap as a 30-day conversion.
    activity_dates = collections.defaultdict(list)
    for task in tasks:
        who, date = task['who_id'], task['activity_date']
        if who and date:
            activity_dates[who].append(date)
    for dates in activity_dates.values():
        dates.sort()

    def first_on_or_after(dates, floor):
        index = bisect.bisect_left(dates, floor)
        return dates[index] if index < len(dates) else ''

    rows = []
    for lead in leads:
        converted = lead['is_converted'] == 'true'
        account = lead['converted_account_id'] if converted else ''

        created = lead['created_date']
        if converted:
            status = 'won'
            # The conversion moment, so the 30-day label window is meaningful.
            last_contacted = first_on_or_after(order_dates.get(account, []), created)
        else:
            status = STATUS_MAP.get(lead['status'], 'unknown')
            last_contacted = ''
        if not last_contacted:
            last_contacted = first_on_or_after(activity_dates.get(lead['id'], []), created)

        name = f"{lead['first_name']} {lead['last_name']}".strip()
        rows.append({
            'lead_id': lead['id'],
            'name': name,
            'phone': lead['phone'],
            'source': SOURCE_MAP.get(lead['lead_source'], 'other'),
            'created_at': lead['created_date'],
            'last_contacted_at': last_contacted,
            'order_value': round(totals.get(account, 0.0), 2),
            'num_orders': counts.get(account, 0),
            'status': status,
        })
    return rows


def write_csv(path, rows):
    with open(path, 'w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('src_dir', help='Directory holding the unzipped Kaggle CSVs')
    parser.add_argument('out_dir', help='Directory to write converted CSVs into')
    parser.add_argument('--sample-size', type=int, default=1000)
    args = parser.parse_args()

    if not os.path.isfile(os.path.join(args.src_dir, 'lead.csv')):
        sys.exit(f'lead.csv not found in {args.src_dir}')

    os.makedirs(args.out_dir, exist_ok=True)
    rows = build_rows(args.src_dir)

    full_path = os.path.join(args.out_dir, 'kaggle_leads_full.csv')
    sample_path = os.path.join(args.out_dir, 'kaggle_leads_sample.csv')
    write_csv(full_path, rows)
    write_csv(sample_path, rows[:args.sample_size])

    won = sum(1 for r in rows if r['status'] == 'won')
    print(f'{len(rows)} rows -> {full_path}')
    print(f'{min(args.sample_size, len(rows))} rows -> {sample_path}')
    print(f'status: {collections.Counter(r["status"] for r in rows).most_common()}')
    print(f'source: {collections.Counter(r["source"] for r in rows).most_common()}')
    print(f'won: {won} ({won / len(rows):.1%})')


if __name__ == '__main__':
    main()
