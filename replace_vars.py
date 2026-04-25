import re

with open('src/shared/design-system/cinematic.css', 'r') as f:
    content = f.read()

replacements = {
    r'var\(--color-black\)': 'var(--background)',
    r'var\(--color-surface\)': 'var(--secondary)',
    r'var\(--color-surface-2\)': 'var(--card)',
    r'var\(--color-surface-3\)': 'var(--muted)',
    r'var\(--color-warm\)': 'var(--foreground)',
    r'var\(--color-warm-dim\)': 'var(--muted-foreground)',
    r'var\(--font-display\)': 'var(--font-z)',
    r'var\(--font-body\)': 'var(--font-sans)'
}

for old, new in replacements.items():
    content = re.sub(old, new, content)

with open('src/shared/design-system/cinematic.css', 'w') as f:
    f.write(content)
