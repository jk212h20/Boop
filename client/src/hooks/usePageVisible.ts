import { useEffect, useState } from 'react';

/** Hidden tabs must not accumulate cosmetic work to replay on return. */
export function usePageVisible() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    update();
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}
