//#region src/updater.ts
/**
* 检查 + 更新——已停用，等价于空操作。
*
* 之所以保留而不是让路由返回 404：老前端、脚本或用户书签可能仍会打这个接口，
* 回一句明确的"已停用"比一个莫名其妙的 404 更有用。
* @param log - 进度输出（插件日志）。
* @returns 固定结果：什么都没做，也没有失败。
*/
async function checkAndUpdate(log = () => {}) {
	log("pi-ai 更新已停用：只使用 DSH 自带那一份");
	return {
		checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
		latest: void 0,
		installed: void 0,
		applied: false,
		compatible: void 0,
		error: void 0
	};
}
/**
* 启动时的后台检查——已停用。
*
* 旧行为：每 6 小时查一次 npm，有新版本就下载到 `vendor/pi-ai/<v>/`。
* 现在只记一行日志，不做任何网络或磁盘操作。
* @param logger - 宿主日志器。
*/
function startBackgroundCheck(logger) {
	logger?.info?.("pi-ai 自动更新已停用：只使用 DSH 自带那一份");
}
//#endregion
export { checkAndUpdate, startBackgroundCheck };
