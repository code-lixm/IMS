# 前端调试协议

## 调试工具
- **主要工具**: `cmux browser` (browser automation)
- **备用工具**: `dev-browser` skill

## 使用场景
当用户报告前端 UI/UX 问题时，使用 browser automation 来：
1. 查看实际页面状态
2. 检查元素样式
3. 验证交互行为
4. 截图确认问题

## 工作流程
1. 启动 browser automation server
2. 导航到问题页面
3. 使用 ARIA snapshot 或截图查看状态
4. 执行必要的交互验证

## 注意
- 确保本地开发服务器已运行 (`pnpm dev`)
- 优先使用 cmux browser（用户已配置）
- 需要时获取页面截图验证修复效果
