const path = require('path');
const webpack = require('webpack');
const merge = require('webpack-merge');

const baseConfig = require('./webpack.base.config');

module.exports = merge.smart(baseConfig, {
    target: 'electron-main',
    entry: {
        main: './src/main/main.ts',
        preload: './src/main/preload.ts'
    },
    externals: { 'electron-updater': 'commonjs electron-updater' },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                loader: 'babel-loader',
                options: {
                    babelrc: false,
                    presets: [
                        [
                            '@babel/preset-env',
                            { targets: { node: '10' }, loose: true }
                        ],
                        '@babel/preset-typescript'
                    ],
                    plugins: [
                        ['@babel/plugin-proposal-class-properties', { loose: true }]
                    ]
                }
            }
        ]
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
        })
    ]
});
