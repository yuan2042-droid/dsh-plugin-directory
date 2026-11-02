/**
 * Host 半身。
 *
 * 真正的界面在 ./client.js（浏览器半身，由 package.json 的 dsh.client 声明，
 * Host 会把它作为模块 serve 进 boot graph）。这里只需要挂一行，让 profile 的
 * 组合结果里有这个插件，并顺带在装载时留一条可检索的日志。
 */
export const name = 'dsh-plugin-directory'

export function apply(ctx) {
  const logger = ctx && ctx.logger
  if (logger && typeof logger.info === 'function') {
    logger.info('[dsh-plugin-directory] 插件目录已挂载，界面在侧边栏「插件目录」')
  }
}
