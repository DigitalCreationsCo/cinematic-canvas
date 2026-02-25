const fs = require('fs');

let labelFile = 'src/client/src/components/ui/label.tsx';
let labelCss = fs.readFileSync(labelFile, 'utf8');

labelCss = labelCss.replace(
  /" font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"/,
  '"text-muted-foreground uppercase tracking-wider text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"'
);

fs.writeFileSync(labelFile, labelCss);
