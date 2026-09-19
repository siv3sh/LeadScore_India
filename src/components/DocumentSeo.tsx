/**
 * Sets <title> and meta tags when the route changes.
 * Static defaults also live in index.html for first paint and crawlers.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyRouteSeo } from '@/lib/seo';

export default function DocumentSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    applyRouteSeo(pathname);
  }, [pathname]);

  return null;
}
