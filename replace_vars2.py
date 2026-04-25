import re

with open('src/shared/design-system/cinematic.css', 'r') as f:
    content = f.read()

replacements = {
    r'var\(--color-accent-red\)': 'var(--destructive)',
    r'var\(--color-border-subtle\)': 'var(--border-glass)',
    r'var\(--color-border-hover\)': 'var(--border-glass-hover)',
    r'var\(--color-muted-warm\)': 'color-mix(in srgb, var(--foreground), transparent 65%)',
    r'var\(--font-mono\)': 'var(--font-mono)'
}

for old, new in replacements.items():
    content = re.sub(old, new, content)

with open('src/shared/design-system/cinematic.css', 'w') as f:
    f.write(content)
