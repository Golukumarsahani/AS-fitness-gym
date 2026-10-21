import { useEffect, useState } from 'react'; import { readContent } from './data';
let p: Promise<any> | null = null;
export function useSiteContent() { const [c, setC] = useState<any>({}); useEffect(() => { p = p || readContent(); p.then(setC); }, []); return c; }
