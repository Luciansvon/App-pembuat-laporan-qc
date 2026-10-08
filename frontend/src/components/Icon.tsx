export type IconName = 'home' | 'inspection' | 'master' | 'report' | 'settings' | 'search' | 'plus' | 'arrow' | 'back' | 'check' | 'clock' | 'camera' | 'upload' | 'database' | 'warning' | 'ruler' | 'test' | 'refresh' | 'close' | 'folder'

const paths: Record<IconName, string> = {
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  inspection: 'M8 5H5v16h14V5h-3M9 3h6v4H9ZM8 12h8M8 16h5',
  master: 'M3 7h18v14H3ZM8 7V3h8v4M3 12h18M10 12v3h4v-3',
  report: 'M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h5',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM10 3h4l1 3 3 1 3 2v4l-3 2-1 3-3 3h-4l-2-3-3-1-2-3V9l3-2 1-3Z',
  search: 'M16 16l5 5M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z',
  plus: 'M12 5v14M5 12h14', arrow: 'M4 12h16M14 6l6 6-6 6', back: 'M20 12H4m6-6-6 6 6 6',
  check: 'm5 12 4 4L19 6', clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v6l4 2',
  camera: 'M3 7h4l2-3h6l2 3h4v14H3ZM12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  database: 'M3 6c0-5 18-5 18 0s-18 5-18 0Zm0 0v12c0 5 18 5 18 0V6M3 12c0 5 18 5 18 0',
  warning: 'm12 3 10 18H2ZM12 9v5m0 3v.1', ruler: 'm3 16 13-13 5 5L8 21Zm5-5 3 3m1-7 3 3',
  test: 'M8 3h8M9 3v7L4 19v2h16v-2l-5-9V3M7 15h10',
  refresh: 'M20 8A9 9 0 0 0 5 5L2 8m0-5v5h5m-3 8a9 9 0 0 0 15 3l3-3m0 5v-5h-5',
  close: 'm6 6 12 12M6 18 18 6', folder: 'M3 5h7l2 3h9v13H3Z',
}

export default function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
