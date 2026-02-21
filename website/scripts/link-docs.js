import fs from 'fs';
import path from 'path';

const contentDir = path.join(process.cwd(), 'content');
const docsLink = path.join(contentDir, 'docs');
const docsSource = path.join(process.cwd(), '../docs');
const relativeSource = path.relative(contentDir, docsSource);

console.log(`Ensuring symlink: ${docsLink} -> ${relativeSource}`);

if (!fs.existsSync(contentDir)) {
  fs.mkdirSync(contentDir, { recursive: true });
}

try {
  const stats = fs.lstatSync(docsLink);
  if (stats.isSymbolicLink()) {
    const currentTarget = fs.readlinkSync(docsLink);
    if (currentTarget === relativeSource) {
      console.log('Symlink is already correct.');
    } else {
      console.log(`Updating symlink from ${currentTarget} to ${relativeSource}`);
      fs.unlinkSync(docsLink);
      fs.symlinkSync(relativeSource, docsLink);
    }
  } else {
    console.warn('WARNING: content/docs exists and is not a symlink. Removing to create symlink.');
    fs.rmSync(docsLink, { recursive: true, force: true });
    fs.symlinkSync(relativeSource, docsLink);
    console.log('Replaced directory with symlink.');
  }
} catch (e) {
  if (e.code === 'ENOENT') {
    fs.symlinkSync(relativeSource, docsLink);
    console.log('Symlink created.');
  } else {
    console.error('Error managing symlink:', e);
    process.exit(1);
  }
}
