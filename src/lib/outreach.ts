import type { Lead } from '@/types';

export type OutreachLang = 'en' | 'hi' | 'ml';
export type WaTemplateId = 'follow_up' | 'missed_call' | 'soft_nudge';

const LANG_STORAGE_KEY = 'leadscore_ui_lang';

export function loadOutreachLang(): OutreachLang {
  try {
    const raw = localStorage.getItem(LANG_STORAGE_KEY);
    if (raw === 'hi' || raw === 'ml' || raw === 'en') return raw;
  } catch {
    // private mode / blocked storage
  }
  return 'en';
}

export function saveOutreachLang(lang: OutreachLang): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

export const OUTREACH_LANG_OPTIONS: { id: OutreachLang; label: string }[] = [
  { id: 'en', label: 'EN' },
  { id: 'hi', label: 'हिंदी' },
  { id: 'ml', label: 'മലയാളം' },
];

type UiKeys =
  | 'todayList'
  | 'allLeads'
  | 'whatsapp'
  | 'call'
  | 'noAnswer'
  | 'tomorrow'
  | 'converted'
  | 'sheetUpdate'
  | 'sheetUpdateHint'
  | 'waTemplate'
  | 'copied';

const UI: Record<OutreachLang, Record<UiKeys, string>> = {
  en: {
    todayList: "Today's list",
    allLeads: 'All leads',
    whatsapp: 'WhatsApp',
    call: 'Call',
    noAnswer: 'No answer',
    tomorrow: 'Tomorrow',
    converted: 'Converted',
    sheetUpdate: 'Copy Sheet update',
    sheetUpdateHint: 'Paste into your Google Sheet to close the loop (phone + status).',
    waTemplate: 'Message',
    copied: 'Copied — paste into your Sheet',
  },
  hi: {
    todayList: 'आज की लिस्ट',
    allLeads: 'सभी लीड्स',
    whatsapp: 'WhatsApp',
    call: 'कॉल',
    noAnswer: 'जवाब नहीं',
    tomorrow: 'कल',
    converted: 'कन्वर्टेड',
    sheetUpdate: 'Sheet अपडेट कॉपी',
    sheetUpdateHint: 'Google Sheet में पेस्ट करें (फोन + स्टेटस) — स्कोर बेहतर होगा।',
    waTemplate: 'मैसेज',
    copied: 'कॉपी हो गया — Sheet में पेस्ट करें',
  },
  ml: {
    todayList: 'ഇന്നത്തെ ലിസ്റ്റ്',
    allLeads: 'എല്ലാ ലീഡുകളും',
    whatsapp: 'WhatsApp',
    call: 'കോൾ',
    noAnswer: 'മറുപടിയില്ല',
    tomorrow: 'നാളെ',
    converted: 'കൺവർട്ടഡ്',
    sheetUpdate: 'Sheet അപ്‌ഡേറ്റ് കോപ്പി',
    sheetUpdateHint: 'Google Sheet-ൽ പേസ്റ്റ് ചെയ്യുക (ഫോൺ + സ്റ്റാറ്റസ്).',
    waTemplate: 'മെസേജ്',
    copied: 'കോപ്പി ചെയ്തു — Sheet-ൽ പേസ്റ്റ് ചെയ്യുക',
  },
};

export function uiLabel(lang: OutreachLang, key: UiKeys): string {
  return UI[lang][key];
}

export const WA_TEMPLATE_OPTIONS: {
  id: WaTemplateId;
  labels: Record<OutreachLang, string>;
}[] = [
    {
      id: 'follow_up',
      labels: { en: 'Follow-up', hi: 'फॉलो-अप', ml: 'ഫോളോ-അപ്പ്' },
    },
    {
      id: 'missed_call',
      labels: { en: 'Missed call', hi: 'मिस्ड कॉल', ml: 'മിസ്ഡ് കോൾ' },
    },
    {
      id: 'soft_nudge',
      labels: { en: 'Soft nudge', hi: 'नरम रिमाइंडर', ml: 'സോഫ്റ്റ് റിമൈൻഡർ' },
    },
  ];

export function waTemplateLabel(id: WaTemplateId, lang: OutreachLang): string {
  const opt = WA_TEMPLATE_OPTIONS.find((o) => o.id === id);
  return opt?.labels[lang] ?? id;
}

/** Leads with outreach logged — useful for Sheet paste-back. */
export function leadsWithOutreachLogged(leads: Lead[]): Lead[] {
  return leads.filter((l) => {
    if (l.last_contacted_at) return true;
    const key = (l.status ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
    return key === 'contacted' || key === 'won' || key === 'lost' || key === 'no_response';
  });
}

function who(name: string | null): string {
  return name?.trim() || 'there';
}

/** Prefill text for wa.me — English / Hindi / Malayalam templates. */
export function whatsappTemplateMessage(
  template: WaTemplateId,
  lang: OutreachLang,
  name: string | null
): string {
  const w = who(name);
  switch (template) {
    case 'follow_up':
      switch (lang) {
        case 'hi':
          return `नमस्ते ${w}, हमारी टीम से एक छोटा फॉलो-अप है। बात करने का अच्छा समय कब रहेगा?`;
        case 'ml':
          return `ഹായ് ${w}, ഞങ്ങളുടെ ടീമിൽ നിന്നുള്ള ഒരു ചെറിയ ഫോളോ-അപ്പ്. സംസാരിക്കാൻ നല്ല സമയം എപ്പോഴാണ്?`;
        case 'en':
          return `Hi ${w}, this is a quick follow-up from our team. When would be a good time to talk?`;
        default: {
          const _exhaustive: never = lang;
          return _exhaustive;
        }
      }
    case 'missed_call':
      switch (lang) {
        case 'hi':
          return `नमस्ते ${w}, हमने कॉल किया था लेकिन बात नहीं हो पाई। अब बात कर सकते हैं क्या?`;
        case 'ml':
          return `ഹായ് ${w}, ഞങ്ങൾ കോൾ ചെയ്തിരുന്നു, പക്ഷേ ബന്ധപ്പെടാൻ കഴിഞ്ഞില്ല. ഇപ്പോൾ സംസാരിക്കാമോ?`;
        case 'en':
          return `Hi ${w}, we tried calling but couldn't reach you. Is now a good time for a quick chat?`;
        default: {
          const _exhaustive: never = lang;
          return _exhaustive;
        }
      }
    case 'soft_nudge':
      switch (lang) {
        case 'hi':
          return `नमस्ते ${w}, सिर्फ याद दिलाने के लिए — क्या आप अभी भी दिलचस्पी रखते हैं? एक छोटे जवाब से मदद होगी।`;
        case 'ml':
          return `ഹായ് ${w}, ഒരു ഓർമ്മപ്പെടുത്തൽ മാത്രം — നിങ്ങൾക്ക് ഇപ്പോഴും താൽപ്പര്യമുണ്ടോ? ഒരു ചെറിയ മറുപടി മതി.`;
        case 'en':
          return `Hi ${w}, just checking in — are you still interested? A short reply helps us help you faster.`;
        default: {
          const _exhaustive: never = lang;
          return _exhaustive;
        }
      }
    default: {
      const _exhaustive: never = template;
      return _exhaustive;
    }
  }
}

/**
 * TSV for paste-back into Google Sheets (phone + outcome).
 * Live write API needs OAuth — paste-back keeps Sheet as source of truth without CRM complexity.
 */
export function buildSheetOutcomeTsv(leads: Lead[]): string {
  const header = ['phone', 'name', 'status', 'last_contacted_at', 'priority', 'score_0_100'].join(
    '\t'
  );
  const rows = leads.map((l) =>
    [
      l.phone ?? '',
      l.name ?? '',
      l.status ?? '',
      l.last_contacted_at ?? '',
      l.priority ?? '',
      l.score_0_100 ?? '',
    ]
      .map((cell) => String(cell).replace(/\t|\n|\r/g, ' '))
      .join('\t')
  );
  return [header, ...rows].join('\n');
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('Could not copy to clipboard');
}
