const path = require('path');

module.exports = {
  mode: 'production',
  entry: {
    inpage: './src/inpage.js',
    // We can bundle content too if we wanted imports there, but inpage is the one needing ethers
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
};
