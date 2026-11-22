const { version } = require('../package.json');

module.exports = {
  appId: 'io.github.rivers0ft.rouge',
  extraMetadata: { version },
  artifactName: 'ROUGE-' + version + '-Windows-x64.${ext}',
  directories: { output: '../artifacts/windows' },
  files: ['main.cjs'],
  extraResources: [{ from: '../.cache/windows-game', to: 'game' }],
  npmRebuild: false,
};
