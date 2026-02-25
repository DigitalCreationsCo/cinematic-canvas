const fs = require('fs');
let headerFile = 'website/components/header.tsx';
let content = fs.readFileSync(headerFile, 'utf8');

content = content.replace(
  /"relative w-full border-b border-border\/60 bg-background\/50 backdrop-blur glass-brick z-50"/,
  '"sticky top-0 w-full border-b border-border/60 bg-background/50 backdrop-blur glass-brick z-50"'
);

fs.writeFileSync(headerFile, content);
