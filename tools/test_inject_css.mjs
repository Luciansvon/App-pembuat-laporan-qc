import { evalInWebview } from './mumu_cdp.mjs';

const css = `
.photo-lightbox-modal {
  z-index: 1250 !important;
  padding: 8px !important;
}
.photo-modal-card {
  width: 100% !important;
  max-height: 96vh !important;
  border-radius: 12px !important;
}
.photo-modal-header {
  padding: 10px 14px !important;
}
.photo-modal-header h3 {
  font-size: 16px !important;
}
.photo-modal-content {
  display: flex !important;
  flex-direction: column !important;
  overflow-y: auto !important;
}
.photo-modal-image-col {
  padding: 8px 12px !important;
  flex-shrink: 0 !important;
}
.photo-modal-img {
  max-height: 140px !important;
  object-fit: contain !important;
}
.photo-modal-caption-bar {
  margin-top: 4px !important;
  padding: 4px 8px !important;
  font-size: 11px !important;
}
.photo-modal-vision-col {
  padding: 12px 14px 28px !important;
  overflow-y: visible !important;
  flex-shrink: 0 !important;
  gap: 10px !important;
}
.photo-vision-header h4 {
  font-size: 14px !important;
}
.photo-vision-header p {
  font-size: 11px !important;
  margin: 2px 0 0 !important;
}
.photo-vision-result {
  padding: 10px !important;
  gap: 8px !important;
}
.vision-findings-box {
  font-size: 12px !important;
  line-height: 1.4 !important;
}
.vision-caption-box {
  padding: 8px !important;
}
.caption-box-head strong {
  font-size: 11px !important;
}
.vision-caption-box p {
  font-size: 11.5px !important;
}
`;

await evalInWebview(`
  let s = document.getElementById('test-fix-style');
  if (!s) {
    s = document.createElement('style');
    s.id = 'test-fix-style';
    document.head.appendChild(s);
  }
  s.textContent = ${JSON.stringify(css)};
  document.querySelector('.photo-modal-content').scrollTop = 0;
`);

console.log('Injected successfully!');
