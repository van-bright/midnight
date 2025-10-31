# Midnight 脚本使用说明

1. 安装node.js, 参考: `https://nodesource.com/products/distributions`
2. 下载源码:  `git clone https://github.com/van-bright/midnight`
3. 编译: `npm install && npm run build`
4. 重复以下步骤打开多个chrome实例:
    1. 打开一个终端, 进入到midnight
    2. 运行命令: `node dist/index.js https://sm.midnight.gd/wizard/mine`
    3. 手动安装lace钱包和创建账号. **必须要记住助记词, 重启后插件会丢失, 需要重新导入助记词**
    4. 启动midnight挖矿.
    5. 回到终端中, 敲回车启动监控脚本.