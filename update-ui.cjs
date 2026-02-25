const fs = require('fs');

// Button
let buttonFile = 'src/client/src/components/ui/button.tsx';
let buttonCss = fs.readFileSync(buttonFile, 'utf8');

buttonCss = buttonCss.replace(
  /" hover-elevate active-elevate-2",/,
  '" hover-elevate active-elevate-2 btn-cinematic",'
);

buttonCss = buttonCss.replace(
  `    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )`,
  `    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        />
      )
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        <span className="btn-cinematic-text inline-flex items-center justify-center gap-2 w-full h-full">
          {props.children}
        </span>
      </Comp>
    )`
);

fs.writeFileSync(buttonFile, buttonCss);

// Tabs
let tabsFile = 'src/client/src/components/ui/tabs.tsx';
let tabsCss = fs.readFileSync(tabsFile, 'utf8');

tabsCss = tabsCss.replace(
  /className={cn\([\s\S]*?"inline-flex cursor-pointer items-center justify-center whitespace-nowrap  px-3 py-1.5  font-medium  transition-all/,
  `className={cn(\n      "inline-flex cursor-pointer items-center justify-center whitespace-nowrap px-3 tab-padding font-medium transition-all`
);

fs.writeFileSync(tabsFile, tabsCss);

// Card
let cardFile = 'src/client/src/components/ui/card.tsx';
let cardCss = fs.readFileSync(cardFile, 'utf8');

cardCss = cardCss.replace(
  /"shadcn-card   bg-card  text-card-foreground ",/,
  '"shadcn-card cinematic-card bg-card text-card-foreground ",'
);

cardCss = cardCss.replace(
  /"flex flex-col space-y-1.5 p-6"/,
  '"flex flex-col space-y-1.5 header-padding px-6"'
);

fs.writeFileSync(cardFile, cardCss);

