//#region src/types.ts
/** JSON 对象 → 记录；不是对象就给空记录。 */
function asRecord(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
	return value;
}
/** 读字符串字段，空的/非字符串一律 undefined。 */
function readString(value) {
	return typeof value === "string" && value !== "" ? value : void 0;
}
/** 读数字字段（数字字符串也认）。 */
function readNumber(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
}
//#endregion
export { asRecord, readNumber, readString };
