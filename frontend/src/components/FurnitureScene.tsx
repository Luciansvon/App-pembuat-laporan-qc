import { useId } from 'react'

export default function FurnitureScene({ className = '' }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const wallId = `wall-${uid}`
  const oakId = `oak-${uid}`
  return <svg className={className} viewBox="0 0 300 340" fill="none" aria-hidden="true">
    <defs><linearGradient id={wallId} x2="1" y2="1"><stop stopColor="#e9e1d1"/><stop offset="1" stopColor="#c8b69d"/></linearGradient><linearGradient id={oakId} x2="1" y2=".4"><stop stopColor="#d2a06a"/><stop offset=".45" stopColor="#aa7346"/><stop offset="1" stopColor="#dcb787"/></linearGradient></defs>
    <path fill={`url(#${wallId})`} d="M0 0h300v340H0z"/><path fill="#b8a084" d="M0 256h300v84H0z"/><path d="M0 290h300M0 325h300m-30-69-75 84m-32-84-75 84M85 256 10 340" stroke="#ad957a" strokeWidth="1"/>
    <path fill="#f3eddf" d="M14 0h55v252H14z"/><path stroke="#d0c2ac" d="M32 0v251m19-251v251"/>
    <ellipse cx="170" cy="299" rx="86" ry="19" fill="#745b44" opacity=".18"/>
    <path d="m104 180-8 112m120-112 15 112m-107-110 10 91m59-99-2 92" stroke={`url(#${oakId})`} strokeWidth="10"/>
    <path d="M104 105h115l-3 83H111Z" fill={`url(#${oakId})`}/><path d="M111 115h99l-2 55h-91Z" fill="#cab092"/><path d="m113 123 96 4m-93 7 93 4m-89 7 88 3" stroke="#b09577" strokeWidth="1"/>
    <path d="m101 177 111-8 22 26-122 15Z" fill="#d1ad81"/><path d="m112 210 122-15v10l-122 16Z" fill="#a67548"/><path d="m101 177 11 33v11l-10-31Z" fill="#9a673e"/>
    <path d="m116 216 106-9m-115 47 115-8" stroke="#b78353" strokeWidth="5"/>
    <path d="M268 261v-80m0 44-24-27m24 13 18-41m-18 29-17-46m17 27 11-42" stroke="#6d765c" strokeWidth="3"/>
    <path d="M260 186q-35-2-25-28 25 0 25 28Zm12-8q-6-30 18-32 14 22-18 32Zm-9-31q-23-7-16-29 25 4 16 29Zm11-10q-2-24 18-24 10 19-18 24Z" fill="#738365"/><path d="m248 245 40-2-7 37h-28Z" fill="#927e65"/>
  </svg>
}
