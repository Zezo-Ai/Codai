const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

/**
 * Build portable Python environment for Electron
 */

console.log('Building portable Python environment...');

const platform = process.platform;
const arch = process.arch;
const pythonVersion = '3.11.7';

const rootDir = path.join(__dirname, '..');
const pythonDistDir = path.join(rootDir, 'python-dist');

// Clean previous build
if (fs.existsSync(pythonDistDir)) {
  fs.rmSync(pythonDistDir, { recursive: true, force: true });
}
fs.mkdirSync(pythonDistDir, { recursive: true });

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function buildWindows() {
  console.log('Building for Windows...');
  
  const pythonUrl = `https://www.python.org/ftp/python/${pythonVersion}/python-${pythonVersion}-embed-amd64.zip`;
  const pythonZip = path.join(pythonDistDir, 'python.zip');
  const pythonDir = path.join(pythonDistDir, 'python');
  
  // Download Python
  console.log('Downloading Python...');
  await downloadFile(pythonUrl, pythonZip);
  
  // Extract Python
  console.log('Extracting Python...');
  fs.mkdirSync(pythonDir, { recursive: true });
  execSync(`powershell -Command "Expand-Archive -Path '${pythonZip}' -DestinationPath '${pythonDir}' -Force"`, { stdio: 'inherit' });
  fs.unlinkSync(pythonZip);
  
  // Download get-pip.py
  console.log('Installing pip...');
  const getPipPath = path.join(pythonDir, 'get-pip.py');
  await downloadFile('https://bootstrap.pypa.io/get-pip.py', getPipPath);
  
  // Install pip
  execSync(`"${path.join(pythonDir, 'python.exe')}" "${getPipPath}"`, { 
    stdio: 'inherit',
    cwd: pythonDir
  });
  
  // Update python._pth to include site-packages
  const pthFile = path.join(pythonDir, 'python311._pth');
  const pthContent = `python311.zip
.
Lib\\site-packages
..\\backend
`;
  fs.writeFileSync(pthFile, pthContent);
  
  // Install dependencies
  console.log('Installing Python dependencies...');
  const pipPath = path.join(pythonDir, 'Scripts', 'pip.exe');
  const requirementsPath = path.join(rootDir, 'requirements.txt');
  
  execSync(`"${pipPath}" install --no-deps --target "${path.join(pythonDir, 'Lib', 'site-packages')}" -r "${requirementsPath}"`, {
    stdio: 'inherit',
    cwd: rootDir
  });
  
  // Copy runtime dependencies
  console.log('Copying runtime dependencies...');
  const dllsNeeded = ['vcruntime140.dll', 'vcruntime140_1.dll'];
  for (const dll of dllsNeeded) {
    const systemDll = path.join(process.env.SystemRoot, 'System32', dll);
    if (fs.existsSync(systemDll)) {
      fs.copyFileSync(systemDll, path.join(pythonDir, dll));
    }
  }
}

async function buildUnix() {
  console.log('Building for Unix-like systems...');
  
  // For Unix systems, we'll use the system Python but create a virtual environment
  const venvDir = path.join(pythonDistDir, 'venv');
  
  console.log('Creating virtual environment...');
  execSync(`python3 -m venv "${venvDir}"`, { stdio: 'inherit' });
  
  // Install dependencies
  console.log('Installing Python dependencies...');
  const pipPath = path.join(venvDir, 'bin', 'pip');
  const requirementsPath = path.join(rootDir, 'requirements.txt');
  
  execSync(`"${pipPath}" install -r "${requirementsPath}"`, {
    stdio: 'inherit',
    cwd: rootDir
  });
  
  // Create a launcher script
  const launcherContent = `#!/bin/bash
DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
export PYTHONPATH="$DIR/../backend:$PYTHONPATH"
"$DIR/venv/bin/python" "$@"
`;
  
  const launcherPath = path.join(pythonDistDir, 'python');
  fs.writeFileSync(launcherPath, launcherContent);
  fs.chmodSync(launcherPath, '755');
}

// Main build process
(async () => {
  try {
    if (platform === 'win32') {
      await buildWindows();
    } else {
      await buildUnix();
    }
    
    console.log('Python build completed successfully!');
    console.log(`Output directory: ${pythonDistDir}`);
    
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
})();