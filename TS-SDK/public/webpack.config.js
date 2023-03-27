const webpack = require("webpack");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const commonConfig = {
  mode: "production",
  entry: "./src/index.ts",
  devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    plugins: [new TsconfigPathsPlugin()],
  },
  plugins: [],
};

const webConfig = {
  ...commonConfig,
  target: "web",
  output: {
    filename: "bundle.js",
    libraryTarget: "umd",
    library: "AverTS",
  },
  resolve: {
    ...commonConfig.resolve,
    fallback: {
      stream: require.resolve("stream-browserify"),
      buffer: require.resolve("buffer"),
      path: require.resolve("path-browserify"),
      crypto: require.resolve("crypto-browserify"),
      tls: require.resolve("tls"),
      net: require.resolve("net"),
      zlib: require.resolve("zlib-browserify"),
      util: require.resolve("util"),
      fs: false,
      os: require.resolve("os"),
      https: false,
      http: false,
      url: false,
      assert: false
    },
  },
  plugins: [
    ...commonConfig.plugins,
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
    }),
    new webpack.ProvidePlugin({
      process: "process/browser",
    }),
  ],
};

const nodeConfig = {
  ...commonConfig,
  target: "node",
  output: {
    libraryTarget: "commonjs",
    filename: "averts.production.js",
  },
};

module.exports = [webConfig, nodeConfig];