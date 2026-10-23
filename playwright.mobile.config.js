import base from './playwright.config.js';
export default {...base,projects:[{name:'touch-chromium',use:{browserName:'chromium',isMobile:true,hasTouch:true,deviceScaleFactor:3,viewport:{width:390,height:844}}}]};
