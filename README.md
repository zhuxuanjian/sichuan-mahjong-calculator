# 四川麻将工具箱

完全离线的四川麻将辅助网页，只保留“胡牌计算”和“出牌建议”两个工具。可以直接打开 [在线版](https://zhuxuanjian.github.io/sichuan-mahjong-calculator/)，或双击 `index.html` 在本机浏览器中使用；不需要安装依赖。

## 使用

- **胡牌计算**（`#hu`）：选择定缺，录入 1、4、7、10 或 13 张手牌，查看可以胡哪些牌。手牌中仍有定缺花色时，会提示先打出。
- **出牌建议**（`#discard`）：选择定缺，录入 2、5、8、11 或 14 张摸牌后手牌，再点击一张手牌，查看打出后可以胡哪些牌及理论剩余张数。如果当前手牌本身已经胡牌，会先给出提示，但仍能继续选择弃牌比较结果。

其他非零手牌张数会提示“当前手牌相公”。每种牌最多录入四张，最多录入 14 张。出牌建议中若手牌还含定缺花色，只能先选择打出定缺牌。

“理论剩余”只按已录入的自家手牌从四张中扣除，不读取牌河、其他玩家手牌或牌墙。显示“0 张／绝张”表示结构上可胡，但已录入的四张都在手中。

手机上每个花色的九张选牌及当前手牌均按屏幕宽度缩成单行，不横向滚动。当前手牌紧接选牌区下方；点击牌可移除或选作拟弃牌，出牌页上的“×”用于移除对应牌。

## 测试

需要 Node.js。在项目目录运行：

```powershell
$testFiles = Get-ChildItem tests -Filter '*.test.js' | Sort-Object Name | ForEach-Object FullName
node --test --test-isolation=none $testFiles
node tests/hu-browser-smoke.mjs
node tests/discard-browser-smoke.mjs
```

浏览器脚本使用已安装的 Microsoft Edge；在限制启动浏览器的沙箱中，请于普通终端执行。
