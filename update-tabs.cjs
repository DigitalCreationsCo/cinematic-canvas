const fs = require('fs');

let tabsFile = 'src/client/src/components/ui/tabs.tsx';
let tabsCss = fs.readFileSync(tabsFile, 'utf8');

tabsCss = tabsCss.replace(
  /"inline-flex cursor-pointer items-center justify-center whitespace-nowrap  px-3 py-1.5  font-medium  transition-all/,
  `"inline-flex cursor-pointer items-center justify-center whitespace-nowrap px-3 tab-padding font-medium transition-all`
);

fs.writeFileSync(tabsFile, tabsCss);
