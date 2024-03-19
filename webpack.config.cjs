const path = require('path');

module.exports = {
  target: 'node',
  mode: 'production',
  entry: {
    pre: './src/pre.ts',
    main: './src/main.ts',
    post: './src/post.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.md$/,
        use: 'raw-loader',
        exclude: /node_modules/,
      },
    ],
  },
  devtool: 'source-map',
};
