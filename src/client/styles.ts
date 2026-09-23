/**
 * 插件样式：沿用 GUI 的 CSS 变量，跟模型座位视觉一致。
 * installCss 一律手写 style 标签（官方 styles.insert 需要 inject 'styles'，见文件末尾注释）。
 */
import { t } from './i18n.js'

var css =
  '.plan_root{position:relative;display:inline-flex;align-items:center}' +
  '.plan_dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}' +
  '.plan_dot_ok{background:#22a06b}.plan_dot_warn{background:#d9a300}.plan_dot_bad{background:#d9534f}' +
  '.plan_tag{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-tertiary);font-weight:400}' +
  '.plan_warnText{color:#b8860b}.plan_badText{color:#d9534f}' +
  '.plan_note{margin-top:3px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary);word-break:break-word}' +
  // ---- 模型选择器（搜索/过滤/余额）----
  '.mp_search{box-sizing:border-box;width:100%;padding:6px 10px;margin-bottom:4px;font:inherit;font-size:12px;' +
  'color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:8px;outline:0}' +
  '.mp_search:focus{border-color:var(--dsw-alias-brand-primary,var(--dsw-alias-border-l2,rgba(0,0,0,.2)))}' +
  '.mp_chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px}' +
  '.mp_chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font:inherit;font-size:12.5px;line-height:18px;' +
  'color:var(--dsw-alias-label-secondary);background:0 0;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));' +
  'border-radius:999px;cursor:pointer}' +
  '.mp_chip[data-on="1"]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.05));' +
  'border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}' +
  '.mp_modelName{font-weight:500}' +
  '.mp_empty{padding:14px 10px;text-align:center;font-size:12px;color:var(--dsw-alias-label-tertiary)}' +
  // ---- 模型座位：官方 ModelSelect 同款（两级层级，Figma 313:14108 / 496:26454 规格）----
  // 宽度上限：官方 ModelSelect 用 min(360px, 45cqw)，那是按「模型名 + 档位」两段内容算的；
  // 我们多两段（provider、余量），实测宽窗口下 360px 装不下就到处截断，所以上限放到
  // min(560px, 60cqw)。60cqw 仍是相对 composer 行（InputBar 的 .row 声明了 container-type，
  // 跟官方 PermissionSelect 的 460px 断点在同一个匿名容器里），宽行不会让触发器吃掉半行。
  '.ms_trigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:min(560px,60vw);' +
  'max-width:min(560px,60cqw);height:28px;' +
  'padding:0 4px 0 8px;border:0;border-radius:24px;background:transparent;outline:0;' +
  'color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;font-weight:500;' +
  'cursor:pointer;white-space:nowrap}' +
  '.ms_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
  '.ms_trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}' +
  // 触发器里四段内容的让位优先级：档位（用户显式选的）> 模型名 > 余量 > provider。
  // provider 的收缩因子压倒性大，空间不够先缩没它（不会把模型名和档位切碎）；
  // 档位与余量一律不收缩，宁可让模型名省略。
  '.ms_tLabel{min-width:0;overflow:hidden;text-overflow:ellipsis}' +
  '.ms_tProvider{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;flex-shrink:999}' +
  '.ms_tModel{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;flex-shrink:1}' +
  '.ms_tSlash{flex:0 0 auto}' +
  '.ms_tEffort{flex:0 0 auto;' +
  'color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary))}' +
  // 触发器里供应商段后面的余量（点 + 百分比/余额）：不参与收缩
  '.ms_tQuota{flex:0 0 auto;display:inline-flex;align-items:center;gap:3px;font-size:11px;line-height:16px;' +
  'color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary))}' +
  // 行宽不够时的两级降级（断点按 composer 行宽，容器见上面的注释；数字是按四段的总宽
  // 除以 60cqw 反推的——触发器上限恰好装不下全部内容的那一行宽）：
  //   ≤760px：装不下「provider / 余量 模型 档位」→ 整段去掉 provider 与分隔符
  //   ≤620px：再省掉余量数字，只留指示点
  '@container (max-width:760px){.ms_tProvider,.ms_tSlash{display:none}}' +
  '@container (max-width:620px){.ms_tQuotaText{display:none}}' +
  '.ms_chev{flex:0 0 auto;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));' +
  'transition:transform .12s ease}' +
  '.ms_chevOpen{transform:rotate(180deg)}' +
  '.ms_menu{position:absolute;bottom:calc(100% + 6px);right:0;z-index:1100;display:flex;flex-direction:column;' +
  'width:max-content;min-width:min(240px,calc(100vw - 32px));max-width:min(420px,calc(100vw - 32px));' +
  // 高度自适应（用户批注）：默认 360px；provider 多到 chips 换行时（ms_menuTall）才放大
  'max-height:min(360px,calc(100vh - 96px));overflow:hidden;padding:4px;border:0;border-radius:20px;' +
  'background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));' +
  'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));color:var(--dsw-alias-label-primary)}' +
  '.ms_menu.ms_menuTall{max-height:min(560px,calc(100vh - 96px))}' +
  '.ms_cell{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:auto;min-width:100%;height:40px;' +
  'padding:0 10px;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);' +
  'font:inherit;font-size:14px;line-height:22px;cursor:pointer;text-align:left}' +
  '.ms_cell:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
  '.ms_cellLabel{flex:0 0 auto;white-space:nowrap}' +
  '.ms_cellValue{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
  'text-align:right;color:var(--dsw-alias-label-tertiary)}' +
  '.ms_cellChev{flex:0 0 auto;color:var(--dsw-alias-label-tertiary)}' +
  '.ms_scroll{min-height:0;overflow-y:auto;display:flex;flex-direction:column}' +
  '.ms_group{margin-top:4px}' +
  '.ms_groupTitle{position:sticky;top:0;z-index:1;padding:5px 8px 3px;' +
  'background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-tertiary);' +
  'font-size:12px;line-height:18px;font-weight:500}' +
  '.ms_option{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:auto;min-width:100%;' +
  'min-height:38px;padding:6px 8px;border:0;border-radius:10px;background:transparent;color:inherit;' +
  'font:inherit;font-size:14px;line-height:20px;text-align:left;cursor:pointer}' +
  '.ms_option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
  '.ms_option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}' +
  '.ms_name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}' +
  '.ms_capsCol{flex:none;width:92px;display:flex;justify-content:flex-end;align-items:center;gap:4px}' +
  '.ms_ctxCol{flex:none;width:48px;text-align:right;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}' +
  '.ms_check{flex:0 0 18px;display:grid;place-items:center;color:var(--dsw-alias-label-primary)}' +
  '.ms_status{padding:10px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}' +
  // ---- 设置页 Provider 标签 ----
  '.pv_section{display:flex;flex-direction:column;gap:12px;max-width:640px}' +
  '.pv_card{padding:14px 16px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:12px;' +
  'background:var(--dsw-alias-bg-layer-1,#fff)}' +
  '.pv_title{font-size:13px;font-weight:600;line-height:18px;margin-bottom:8px}' +
  '.pv_line{display:flex;align-items:center;gap:10px;font-size:13px;line-height:22px;padding:3px 0;' +
  'color:var(--dsw-alias-label-secondary)}' +
  '.pv_action{margin-left:auto;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);' +
  'background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.05));border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));' +
  'border-radius:6px;padding:4px 12px;cursor:pointer}' +
  '.pv_action:disabled{opacity:.5;cursor:default}' +
  // 「启用最新版 pi-ai」开关（pill 形态，同系统设置页 toggle）
  '.pv_toggle{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none}' +
  '.pv_switch{appearance:none;-webkit-appearance:none;position:relative;flex:none;width:34px;height:20px;' +
  'margin:0;border-radius:10px;background:var(--dsw-alias-fill-tertiary,rgba(0,0,0,.16));' +
  'transition:background .15s;cursor:pointer}' +
  '.pv_switch:checked{background:var(--dsw-alias-label-primary,#1f2329)}' +
  '.pv_switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;' +
  'border-radius:50%;background:#fff;transition:left .15s}' +
  '.pv_switch:checked::after{left:16px}' +
  '.pv_switch:disabled{opacity:.5;cursor:default}' +
  // ---- Provider 标签：CC Switch 式卡片（字号/间距对齐官方插件页）----
  '.pv_stack{display:flex;flex-direction:column;gap:14px;max-width:600px}' +
  '.pv_pc{list-style:none;border:.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.15));border-radius:16px;' +
  'background:var(--dsw-alias-bg-layer-3,#fff);transition:border-color .16s,background .16s;' +
  'display:flex;flex-direction:column}' +
  '.pv_pc:hover{border-color:var(--dsw-alias-label-dimmed,rgba(0,0,0,.3))}' +
  // 展开态：官方读法「正在操作的卡」——底变 layer-2（更沉）、边框加深
  '.pv_pcOpen{background:var(--dsw-alias-bg-layer-2,#f4f5f6);border-color:var(--dsw-alias-label-dimmed,rgba(0,0,0,.3))}' +
  '.pv_pcTop{display:flex;align-items:stretch}' +
  '.pv_pcMain{flex:1;min-width:0;display:flex;flex-direction:column}' +
  '.pv_pcCaretCol{flex:none;width:36px;display:flex;align-items:center;justify-content:center;' +
  'cursor:pointer;color:var(--dsw-alias-label-tertiary)}' +
  '.pv_pcCaretCol:hover{color:var(--dsw-alias-label-secondary)}' +
  '.pv_pcHead{display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border:0;background:0 0;' +
  'cursor:pointer;font:inherit;color:inherit;text-align:left;border-radius:12px}' +
  '.pv_pcHead:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b5bdb);outline-offset:-2px}' +
  '.pv_pcName{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary);' +
  'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '.pv_pcChips{flex:none;display:flex;align-items:center;gap:10px;font-size:13px;white-space:nowrap}' +
  '.pv_chipItem{display:inline-flex;align-items:baseline;gap:2px}' +
  '.pv_chipLabel{color:var(--dsw-alias-label-secondary)}' +
  '.pv_chipSep{flex:none;width:1px;height:12px;margin:0 4px;background:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}' +
  '.pv_chipReset{color:var(--dsw-alias-label-tertiary);font-size:12px}' +
  '.pv_pcCaret{flex:none;display:block;color:var(--dsw-alias-label-tertiary);' +
  'transition:transform .16s}' +
  '.pv_pcCaretOpen{transform:rotate(180deg)}' +
  // 第二行：余量摘要 + 操作（官方卡片没有这一行，是我们的产品扩展）
  '.pv_pcMeta{display:flex;align-items:center;gap:10px;padding:2px 16px 14px;font-size:13px;flex-wrap:wrap}' +
  '.pv_metaActs{margin-left:auto;display:inline-flex;align-items:center;gap:4px}' +
  '.pv_pcWeb{display:inline-flex;align-items:center;color:var(--dsw-alias-label-tertiary);text-decoration:none;' +
  'font-size:14px;line-height:20px;padding:0 2px;border-radius:6px}' +
  '.pv_pcWeb:hover{color:var(--dsw-alias-label-secondary)}' +
  // 等级胶囊（Coding Plan 会员档）：业务蓝描边 + 蓝字，靠右
  '.pv_lv{flex:none;margin-left:auto;font-size:12px;line-height:18px;padding:1px 10px;border-radius:999px;' +
  'white-space:nowrap;color:var(--dsw-alias-state-business-primary,#5b8cff);' +
  'border:1px solid var(--dsw-alias-state-business-primary,#5b8cff)}' +
  // 微过渡（官方 .16s 节奏）+ 键盘焦点环
  '.pv_pickItem,.pv_iconBtn,.pv_action,.pv_tab,.pv_addBtn,.pv_fclear,.pv_delYes,.pv_delNo,' +
  '.mp_chip,.pv_pcLink{transition:background-color .16s ease,color .16s ease}' +
  '.pv_iconBtn:focus-visible,.pv_action:focus-visible,.pv_tab:focus-visible,' +
  '.pv_pickItem:focus-visible,.pv_addBtn:focus-visible,a.pv_pcLink:focus-visible,' +
  '.pv_selTrigger:focus-visible{' +
  'outline:2px solid var(--dsw-alias-brand-primary,#3b5bdb);outline-offset:1px}' +
  // 输入框聚焦：只把自身 border-color 加深到主文本色（1px），不加外圈、不叠 inset 阴影。
  // 曾经是「border 加深 + inset 1px 同色阴影」的视觉 2px 粗边，比协议下拉展开态重一截
  // （用户 09-23 批注：API 地址及其它项编辑时边框太粗，应对齐协议的加粗程度）。
  // 与 .pv_selTrigger.pv_selOpen 完全同款（1px + 同一个 label-primary token）——
  // 那处早前也是因同样批注从 inset 双层收敛回来的。
  'input.pv_field:not([readonly]):focus,select.pv_field:focus,textarea.pv_field:focus,.pv_mFilter:focus{' +
  'outline:0;border-color:var(--dsw-alias-label-primary,rgba(0,0,0,.62))}' +
  '.pv_pcBody{border-top:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));' +
  'padding:10px 18px 14px;display:flex;flex-direction:column;gap:4px}' +
  '.pv_line .plan_tag{margin-left:0}' +
  '.pv_line .pv_push{margin-left:auto}' +
  '.pv_row>span:first-child{width:72px;flex:none}' +
  // 次要注解（凭据名这类）：单独一行小字，缩进跟着值列
  '.pv_hint{font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary)}' +
  // 值框（API 密钥/端点）：Cherry 式输入框外观
  '.pv_field{display:inline-flex;align-items:center;min-width:240px;max-width:100%;padding:6px 12px;' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;' +
  'background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));font-size:13px;line-height:20px;' +
  'color:var(--dsw-alias-label-secondary)}' +
  // 模型区外框（零纵向内边距：收起态框=头部行本身，「模型（N）」严格竖向居中；
  // 展开态的底部呼吸感由 .pv_mList / .pv_mEditRow / .pv_me 各自补回——
  // 此前 4px 底 padding 在收起态把头部顶高 1.5px，用户批注文字偏上）
  '.pv_mBox{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:12px;' +
  'padding:0 14px;display:flex;flex-direction:column}' +
  '.pv_mRight{margin-left:auto;display:inline-flex;align-items:center;gap:8px}' +
  '.pv_iconBtn{border:0;background:0 0;cursor:pointer;font:inherit;font-size:15px;padding:3px 6px;' +
  'border-radius:6px;color:var(--dsw-alias-label-tertiary)}' +
  '.pv_iconBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
  '.pv_delOn{color:#e03131;font-size:12px;width:auto;padding:2px 8px}' +
  // 逐模型清单编辑器：勾选行 + 行级展开的参数编辑
  '.pv_modelEditor{display:flex;flex-direction:column;gap:6px;padding:8px 10px;margin-top:6px;' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;' +
  'background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.02))}' +
  '.pv_edHead{display:flex;align-items:center;gap:8px;font-size:12px;' +
  'color:var(--dsw-alias-label-secondary)}' +
  '.pv_edMode{margin-left:auto;font-size:11px;padding:1px 6px;border-radius:6px;' +
  'background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
  '.pv_edItem{display:flex;flex-direction:column;gap:4px}' +
  '.pv_edItemOff{opacity:.5}' +
  '.pv_edRow{display:flex;align-items:center;gap:6px;font-size:12px}' +
  '.pv_edId{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;' +
  'text-overflow:ellipsis;white-space:nowrap}' +
  '.pv_edTag{font-size:11px;padding:1px 6px;border-radius:6px;' +
  'background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));' +
  'color:var(--dsw-alias-label-secondary)}' +
  '.pv_edCaret{margin-left:auto;border:0;background:0 0;cursor:pointer;font:inherit;' +
  'font-size:11px;padding:1px 6px;border-radius:6px;color:var(--dsw-alias-label-tertiary)}' +
  '.pv_edCaret:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
  '.pv_edFields{display:flex;flex-direction:column;gap:4px;padding:6px 0 2px 22px}' +
  '.pv_edField{display:flex;align-items:center;gap:8px;font-size:12px;' +
  'color:var(--dsw-alias-label-secondary)}' +
  '.pv_edField > .pv_field{flex:1;min-width:0}' +
  '.pv_edAdd{display:flex;align-items:center;gap:6px}' +
  '.pv_edActs{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
  // 删除确认区：卡片底部的整块面板（不再与头部 ✕ 同槽位——同位置时双击即删，见 issue #3）
  '.pv_delPanel{display:flex;flex-direction:column;gap:6px;padding:10px 12px;margin-top:2px;' +
  'border:1px solid rgba(224,49,49,.35);border-radius:10px;background:rgba(224,49,49,.05)}' +
  '.pv_delPanelTitle{font-size:13px;font-weight:500;color:#e03131}' +
  '.pv_delPanelBody{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}' +
  '.pv_delPanelActs{display:flex;gap:6px;align-items:center;flex-wrap:wrap}' +
  '.pv_delPanel .pv_delYes{border:1px solid rgba(224,49,49,.5);background:rgba(224,49,49,.1);font-weight:500}' +
  '.pv_delPanel .pv_delNo{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12))}' +
  // 旧的内联确认框样式（.pv_delBox）已随确认区下移一并撤掉
  '.pv_delYes{border:0;background:0 0;cursor:pointer;font:inherit;font-size:12px;color:#e03131;' +
  'padding:3px 9px;border-radius:6px}' +
  '.pv_delYes:hover{background:rgba(224,49,49,.12)}' +
  '.pv_delNo{border:0;background:0 0;cursor:pointer;font:inherit;font-size:12px;' +
  'color:var(--dsw-alias-label-secondary);padding:3px 9px;border-radius:6px}' +
  '.pv_delNo:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
  '@keyframes pvRot{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}' +
  '.pv_spin{display:inline-block;animation:pvRot 1s linear infinite}' +
  // 刷新结果 toast（右下，2.6s 自动消失）
  '.pv_toast{position:fixed;bottom:24px;right:24px;z-index:500;padding:10px 18px;border-radius:12px;' +
  'font-size:13px;line-height:20px;max-width:min(420px,80vw);' +
  'background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));' +
  'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18))}' +
  '.pv_toastOk{color:#2f9e44}' +
  '.pv_toastFail{color:#e03131}' +
  // 上次刷新时间（时钟 + 相对时间，内联在卡片头部）
  '.pv_fresh{font-size:12px;line-height:18px;white-space:nowrap;' +
  'color:var(--dsw-alias-label-tertiary)}' +
  // ---- 添加 provider 面板 ----
  '.pv_addBtn{width:100%;padding:13px;border:1px dashed var(--dsw-alias-border-l2,rgba(0,0,0,.2));' +
  'border-radius:14px;background:0 0;cursor:pointer;font:inherit;font-size:14px;' +
  'color:var(--dsw-alias-label-secondary)}' +
  '.pv_addBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.03))}' +
  'input.pv_field{cursor:text}' +
  // 原生 select 已全部替换为自绘下拉（.pv_sel*，用户批注：原生弹层与页面视觉不协调）
  // ---- 本地版新增：自绘下拉（用户批注：原生弹层与页面视觉不协调）----
  // 触发器外观与 pv_field 输入框一致（白底/同圆角/同边框），弹层用页面 token：
  // 白底 + 圆角 + 柔和投影 + 悬停灰底，选中项品牌色加粗 + 浅底 + 行尾对勾。
  // 展开时触发器边框加黑加粗。
  '.pv_sel{position:relative;display:inline-flex}' +
  '.pv_selTrigger{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;' +
  'min-width:240px;max-width:100%;padding:6px 12px;text-align:left;' +
  'border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.2));border-radius:10px;' +
  'background:var(--dsw-alias-bg-layer-1,#fff);font:inherit;font-size:13px;line-height:20px;' +
  'color:var(--dsw-alias-label-primary);cursor:pointer}' +
  '.pv_selTrigger:hover{border-color:var(--dsw-alias-label-primary,rgba(0,0,0,.62))}' +
  '.pv_selTrigger:focus{outline:0}' +
  // 展开态=悬停同款 1px 深边框（用户批注：原 inset 双层视觉 2px 太黑太粗，收回到图1 的粗度）
  '.pv_selTrigger.pv_selOpen{border-color:var(--dsw-alias-label-primary,rgba(0,0,0,.62))}' +
  // 值文本与其它值列（.pv_field 输入框）同一个灰：曾经继承 trigger 的 label-primary，
  // 于是「协议」行的值是黑的、其它行的值是灰的（用户 09-23 批注）
  '.pv_selValue{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
  'color:var(--dsw-alias-label-secondary)}' +
  '.pv_selChev{display:inline-flex;color:var(--dsw-alias-label-tertiary)}' +
  '.pv_selOpen .pv_selChev{color:var(--dsw-alias-label-primary)}' +
  // 弹层左右锚定容器（left:0;right:0）= 外沿与触发器严格等宽。不用 min-width:100%：
  // 页面没有全局 border-box，content-box 下弹层外沿会多出自身 padding+border（右侧冒出
  // 10px，用户批注：下拉框和协议填写框长度未对齐）。选项超宽时靠 overflow:auto 兜底。
  // 弹层外观逐字段参照「供应商筛选」下拉 .pv_pickMenu（用户 09-23 批注：就按那个的描边做）：
  // border 本来就是同一条 border-l1，差在投影（这里曾是更淡的 0 10px 28px .14，淡投影会把
  // 12% 的边框吃掉，看着像没描边）——换成同一个 elevation-prominent，两个下拉同一张脸。
  '.pv_selMenu{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:60;' +
  'background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));' +
  'border-radius:10px;padding:6px;max-height:240px;overflow:auto;' +
  'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18))}' +
  '.pv_selOption{display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:6px;' +
  'font-size:13px;line-height:20px;text-align:left;cursor:pointer;' +
  'color:var(--dsw-alias-label-primary);white-space:nowrap}' +
  '.pv_selOptLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '.pv_selOption:hover{background:var(--dsw-alias-fill-tertiary,rgba(0,0,0,.045))}' +
  // 选中态=品牌色 + 加粗 + 浅灰底 + 行尾官方对勾：只有颜色/加粗时，在一串 api 名跟前
  // 不够显眼（用户 09-23 批注）。浅底与 hover 同 token；对勾用官方同款 SVG，
  // 与模型座位里标「当前模型」的 .ms_check 同一套做法。
  '.pv_selOptionOn{color:var(--dsw-alias-brand-primary,#3b5bdb);font-weight:600;' +
  'background:var(--dsw-alias-fill-tertiary,rgba(0,0,0,.045))}' +
  '.pv_selCheck{flex:none;margin-left:auto;display:grid;place-items:center;' +
  'color:var(--dsw-alias-brand-primary,#3b5bdb)}' +
  // 带按钮的行（API 地址 + 控制台 Cookie）共用的输入框宽度：两个输入框等宽，
  // 「查询配置」与「保存」才落在同一竖线上（用户 09-23 批注：两个按钮要对齐）。
  // 各自内容定宽的话，URL 长、Cookie 短，按钮会一前一后。
  // 300 是量过的：再宽（360）会把按钮顶到离行尾只剩 34px，看着又成了右对齐
  // （用户上一轮刚批过「不要右对齐」）；再窄则长 URL 可视区不够。
  '.pv_rowField{flex:none;width:min(300px,100%)}' +
  // 预置字段（路由 ID）：灰底只读；密钥/待填项/协议：白底 + 深边框提示可操作
  // （用户批注：协议下拉的边框比 API 地址浅——pv_key 原来限定 input，select 吃不到）
  'input.pv_ro{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.05));' +
  'color:var(--dsw-alias-label-tertiary);cursor:default}' +
  '.pv_key{background:var(--dsw-alias-bg-layer-1,#fff);' +
  'border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}' +
  '.pv_actRow{display:flex;gap:10px;align-items:center;padding:8px 0 4px}' +
  // 就地编辑的操作区：提示独立成行，按钮行与其它保存/取消行同款呼吸距（用户报原来太挤）
  '.pv_editHint{margin:2px 0 0}' +
  '.pv_editActs{display:flex;gap:8px;align-items:center;padding:10px 0 2px}' +
  // 「发现模型」后的可勾选清单：与逐模型编辑器同一套表格（勾选 | 模型 ID | 能力 | 上下文 | 最大输出）
  '.pv_modelPick{max-height:240px;overflow:auto;border:.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));' +
  'border-radius:8px;margin:4px 0 2px;display:flex;flex-direction:column}' +
  '.pv_modelPick .pv_meHeadRow{position:sticky;top:0;z-index:1;background:var(--dsw-alias-bg-layer-1,#fff)}' +
  '.pv_modelPick .pv_meRow .pv_mId{display:inline-flex;align-items:center;gap:6px;min-width:0;' +
  'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;word-break:normal}' +
  '.pv_modelPickName{flex:none;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
  'color:var(--dsw-alias-label-tertiary)}' +
  '.pv_pickNone{color:var(--dsw-alias-label-tertiary)}' +
  // 行内编辑：目录外条目的 ID 可点击（虚线下划线 + 笔尖标记），展开参数面板
  '.pv_mIdEdit{cursor:pointer;text-decoration:underline dotted;' +
  'text-underline-offset:3px;color:var(--dsw-alias-label-secondary)}' +
  '.pv_mIdEdit:hover{color:var(--dsw-alias-label-primary)}' +
  '.pv_mIdOpen{color:var(--dsw-alias-label-primary)}' +
  '.pv_meEditPanel{display:flex;flex-direction:column;gap:6px;padding:8px 10px;' +
  // 左右对称 10px：外框在模型清单框里居中、两侧都留缝（用户报左 18/右 0 既偏又贴外框）
  // 上沿 8px：离外层清单框远一点（用户批注；此前 4px 太贴）
  'margin:8px 10px 8px 10px;' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;' +
  'background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.02))}' +
  // 「测试/完成」按钮行压掉自身 margin-bottom：按钮到面板下沿 = 内边距 8px，
  // 与面板内上边距一致（用户批注：两者要一致）
  '.pv_meEditPanel .pv_meActs{margin-bottom:0}' +
  '.pv_meEditPanel .pv_row{font-size:12px;line-height:20px}' +
  '.pv_meEditPanel .pv_field{min-width:0;flex:1;max-width:320px}' +
  '.pv_mePanelCaps{display:inline-flex;align-items:center;gap:6px}' +
  // ---- 供应商可过滤下拉 ----
  '.pv_pick{flex:1;min-width:0;position:relative}' +
  '.pv_pickBtn{width:100%;cursor:pointer;justify-content:space-between;gap:8px}' +
  '.pv_pickMenu{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:250;padding:6px;' +
  'display:flex;flex-direction:column;gap:4px;border-radius:10px;' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));' +
  'background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));' +
  'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18))}' +
  '.pv_pickList{max-height:240px;overflow:auto;display:flex;flex-direction:column}' +
  '.pv_pickItem{display:flex;align-items:center;gap:6px;padding:8px 12px;border:0;background:0 0;' +
  'cursor:pointer;font:inherit;font-size:13.5px;color:var(--dsw-alias-label-primary);text-align:left;' +
  'border-radius:8px}' +
  '.pv_pickItem:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.04))}' +
  '.pv_pickItem:disabled{opacity:.5;cursor:default}' +
  '.pv_pickEmpty{padding:12px;font-size:13px;color:var(--dsw-alias-label-tertiary);text-align:center}' +
  // ---- 模型选择器行：模型 + 思考强度 ----
  '.pv_msRow{display:flex;align-items:center;gap:8px}' +
  '.pv_msMain{flex:1;min-width:0;display:flex;align-items:center;gap:8px;text-align:left}' +
  'select.pv_msEff{flex:none;font:inherit;font-size:12px;padding:3px 8px;cursor:pointer;text-align:left;' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:6px;' +
  'background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));color:var(--dsw-alias-label-secondary)}' +
  // ---- Provider 页内二级标签 ----
  '.pv_tabs{display:flex;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));' +
  'margin-bottom:14px}' +
  '.pv_tab{font:inherit;font-size:14px;padding:8px 14px;border:0;background:0 0;cursor:pointer;' +
  'color:var(--dsw-alias-label-secondary);border-bottom:2px solid transparent;margin-bottom:-1px}' +
  '.pv_tab:hover{color:var(--dsw-alias-label-primary)}' +
  '.pv_tabOn{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary,#3b5bdb);font-weight:600}' +
  // 标签栏正下方的提示行（note）：两个标签页共用一个渲染位，与卡片内容的 18px 内边距对齐
  '.pv_pageNote{padding:0 18px}' +
  // ---- Provider 卡片：CC Switch 式名称+链接两行布局 ----
  '.pv_pcLead{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}' +
  '.pv_pcLeadRow{display:flex;align-items:center;gap:8px}' +
  '.pv_pcLink{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary);text-decoration:none;' +
  'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '.pv_pcLink:hover{color:var(--dsw-alias-label-secondary);text-decoration:underline}' +
  // ---- 模型行悬浮详情卡（Cherry Studio 式）----
  '.pv_mRow{position:relative;display:flex;align-items:center;gap:8px;padding:3px 0}' +
  // ID 占满弹性宽，超长单行省略号截断（title 兜底完整 ID），绝不溢出画到能力徽标上
  '.pv_mId{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
  'font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);' +
  'font-family:ui-monospace,Menlo,Consolas,monospace}' +
  '.pv_mHeadRow{display:flex;align-items:center;gap:8px;padding:5px 0 4px;font-size:12px;' +
  'color:var(--dsw-alias-label-tertiary);border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}' +
  '.pv_mCaps{flex:none;width:100px;display:inline-flex;justify-content:flex-end;align-items:center;gap:6px}' +
  '.pv_mCtx{flex:none;width:56px;text-align:right;font-size:12px;line-height:18px;' +
  'color:var(--dsw-alias-label-tertiary)}' +
  '.pv_mMax{flex:none;width:64px;text-align:right;font-size:12px;line-height:18px;' +
  'color:var(--dsw-alias-label-tertiary)}' +
  '.pv_capIcons{display:inline-flex;gap:6px;font-size:12px;line-height:16px}' +
  '.pv_capMini{font-size:11px;line-height:16px;padding:0 7px;border-radius:999px;white-space:nowrap}' +
  // 「模型（N）」标题：字重与表单标签一致（不加粗），别在框里显得像另一种字体
  '.pv_mHead{display:flex;align-items:center;gap:6px;flex:1;min-width:0;font:inherit;font-size:13px;font-weight:normal;' +
  'line-height:18px;padding:0;border:0;background:0 0;cursor:pointer;color:var(--dsw-alias-label-primary);text-align:left}' +
  '.pv_mHead:hover{color:var(--dsw-alias-label-secondary)}' +
  // 模型区头部（仿父卡片）：标题左、过滤器右、Chevron 最右；列表区分割线 = 折叠态下边缘（零外边距）
  // 头部行高 = 字号行高(18) + 上下各 10px，恒定不变；过滤框在该行内居中，不撑高行
  '.pv_mTop{display:flex;align-items:center;gap:8px;height:38px;padding:0}' +
  '.pv_mCaretCol{flex:none;width:24px;display:flex;align-items:center;justify-content:center;' +
  'cursor:pointer;color:var(--dsw-alias-label-tertiary)}' +
  '.pv_mCaretCol:hover{color:var(--dsw-alias-label-secondary)}' +
  '.pv_mList{border-top:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));' +
  'margin-top:0;padding:6px 0 4px;display:flex;flex-direction:column}' +
  '.pv_mFilter{flex:none;width:240px;box-sizing:border-box;padding:5px 24px 5px 12px;font:inherit;font-size:13px;' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:8px;outline:0;' +
  'background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));color:var(--dsw-alias-label-primary)}' +
  '.pv_mFilter:focus{border-color:var(--dsw-alias-brand-primary,var(--dsw-alias-border-l2,rgba(0,0,0,.2)))}' +
  '.pv_fbox{position:relative;display:inline-flex;align-items:center;flex:none}' +
  '.pv_fclear{position:absolute;right:2px;top:50%;transform:translateY(-50%);border:0;background:0 0;' +
  'cursor:pointer;font:inherit;font-size:14px;line-height:1;padding:2px 6px;' +
  'color:var(--dsw-alias-label-tertiary);border-radius:6px}' +
  '.pv_fclear:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
  '.pv_tip{display:none;position:absolute;left:0;bottom:calc(100% + 6px);z-index:300;width:270px;' +
  'padding:12px 14px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));' +
  'background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));' +
  'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));flex-direction:column;gap:6px}' +
  '.pv_mRow:hover .pv_tip{display:flex}' +
  '.pv_tipTitle{font-size:13px;font-weight:600;line-height:18px}' +
  '.pv_tipRow{display:flex;gap:10px;font-size:12px;line-height:18px}' +
  '.pv_tipLabel{flex:none;width:60px;color:var(--dsw-alias-label-tertiary)}' +
  '.pv_tipDim{font-size:11px;color:var(--dsw-alias-label-tertiary)}' +
  '.pv_tipCaps{flex:1;min-width:0;display:flex;gap:6px;flex-wrap:wrap;align-items:center}' +
  '.pv_cap{font-size:11px;padding:1px 8px;border-radius:999px}' +
  '.pv_capVision{color:#2f9e44;background:rgba(47,158,68,.12)}' +
  '.pv_capVideo{color:#7c3aed;background:rgba(124,58,237,.12)}' +
  '.pv_capReason{color:#b8860b;background:rgba(217,162,0,.15)}' +
  // ---- 本地版新增：能力来源标记（issue #5）----
  '.pv_capDeclared{color:#0b7285;background:rgba(11,114,133,.12)}' +
  // ---- 本地版新增：逐模型清单编辑器（issue #1）----
  '.pv_me{display:flex;flex-direction:column;gap:8px;padding:10px 0 4px;border-top:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12))}' +
  '.pv_meHead{display:flex;align-items:center;gap:10px}' +
  '.pv_meTitle{font-size:13px;font-weight:600;line-height:18px}' +
  '.pv_meList{display:flex;flex-direction:column;max-height:320px;overflow:auto;' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:10px}' +
  // 编辑器行用网格列布局（勾选 | 模型 ID | 能力 | 上下文 | 最大输出 | 移除）。
  // 表头与数据行必须用完全相同的列宽 / gap / 横向 padding——差 1px 都会让固定列错位
  '.pv_meHeadRow{display:grid;grid-template-columns:12px minmax(140px,1.6fr) 132px 64px 64px 24px;' +
  'gap:6px;align-items:center;padding:5px 8px;font-size:12px;line-height:18px;' +
  'color:var(--dsw-alias-label-tertiary);border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}' +
  '.pv_meRow{display:grid;grid-template-columns:12px minmax(140px,1.6fr) 132px 64px 64px 24px;' +
  'gap:6px;align-items:center;padding:5px 8px;font-size:12px;line-height:18px;' +
  'border-bottom:.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06))}' +
  '.pv_meRow:last-child{border-bottom:0}' +
  '.pv_meRowOff{opacity:.45}' +
  '.pv_meCheck{margin:0;cursor:pointer}' +
  // 表头第一格（全选框）垂直居中：内联 span 会让 checkbox 按 文本基线 排，与「模型 ID」
  // 文字的视觉中心错开（用户批注：全选按钮与模型 ID 的文字没对齐）
  '.pv_meHeadRow > span:first-child{display:flex;align-items:center;height:18px}' +
  // 长 ID 单行省略号截断（截断好过换行挤高行/叠到能力徽标上），完整 ID 走 title 悬停
  '.pv_meIdBox{display:inline-flex;align-items:center;gap:6px;min-width:0}' +
  '.pv_meRow .pv_mId{width:auto;max-width:none;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}' +
  '.pv_meNum{box-sizing:border-box;width:100%;padding:3px 8px;font:inherit;font-size:12px;' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:7px;outline:0;' +
  'background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));color:var(--dsw-alias-label-primary)}' +
  '.pv_meNum:focus{border-color:var(--dsw-alias-brand-primary,var(--dsw-alias-border-l2,rgba(0,0,0,.2)))}' +
  // 上下文 / 最大输出：目录值左对齐落在各自表头正下方（只读展示）
  '.pv_meRow .pv_mCtx,.pv_meRow .pv_mMax{width:auto;text-align:left;font-size:12px;line-height:18px;' +
  'color:var(--dsw-alias-label-tertiary);overflow:visible;white-space:normal}' +
  // 能力列：视觉/视频是可点的徽章开关，推理是只读徽章；行内左对齐、可换行
  '.pv_meRow .pv_mCaps{width:auto;justify-content:flex-start;flex-wrap:wrap}' +
  // ✕ 列 24px：收窄按钮内边距，保证整个可点区域落在列内不被裁掉
  '.pv_meRow .pv_iconBtn{padding:2px 4px;line-height:16px}' +
  '.pv_meCap{display:inline-flex;align-items:center;gap:4px;cursor:pointer;user-select:none;' +
  'font-size:11px;line-height:16px;padding:0 7px;border-radius:999px;white-space:nowrap;' +
  'color:var(--dsw-alias-label-tertiary)}' +
  '.pv_meCap input{margin:0;cursor:pointer}' +
  '.pv_capOff{opacity:.6;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l1,rgba(0,0,0,.15))}' +
  // 「添加模型」表单：仿添加供应商面板（标签在左、输入在右的 pv_row 行 + 底部按钮行）
  // 度量与 pv_pcBody 对齐（13px 行 / 6px 间距 / 18px 内边距），输入随行宽伸展，不再限 320px
  '.pv_meForm{display:flex;flex-direction:column;gap:6px;padding:10px 18px;margin-top:0;margin-bottom:4px;' +
  'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;' +
  'background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.02))}' +
  '.pv_meFormTitle{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}' +
  '.pv_meForm .pv_field{min-width:0;flex:1}' +
  '.pv_meFormCaps{display:inline-flex;align-items:center;gap:6px}' +
  // ---- 本地版新增：思考档位池（与「能力」行同构，chips 一行多个自动换行，用户批注）----
  '.pv_meEffPool{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-width:0;flex:1}' +
  '.pv_meCap.pv_meEffOn{border-color:var(--dsw-alias-border-l1,rgba(0,0,0,.24));' +
  'color:var(--dsw-alias-label-primary);background:var(--dsw-alias-fill-tertiary,rgba(0,0,0,.045))}' +
  // 用量快照加载占位：打开页面时「正在刷新用量…」居中一行（转圈 + 文案）
  // pv_pcBody 是纵向 flex，这里必须改回横向行，转圈和文案才并排居中
  '.pv_usageLoading{flex-direction:row;align-items:center;justify-content:center;gap:8px;padding:22px 0;' +
  'color:var(--dsw-alias-label-tertiary)}' +
  '.pv_usageLoading .pv_spin{font-size:16px;color:var(--dsw-alias-label-secondary)}' +
  // 清单页的「编辑模型」入口行：底部留足呼吸距，别让按钮贴着模型框下边框
  '.pv_mEditRow{display:flex;align-items:center;padding:9px 0 16px}' +
  // 编辑页（勾选编辑器）挂在 .pv_mBox 直下：补回外框让出的 4px 底距，展开态视觉不变
  '.pv_mBox > .pv_me{padding-bottom:4px}' +
  // 编辑器的「添加模型 / 保存」按钮行同样与模型框下边框留呼吸距（模型框自身 padding-bottom 为 0）
  '.pv_meActs{display:flex;align-items:center;gap:8px;margin-top:3px;margin-bottom:4px}' +
  // ---- 本地版新增：删除确认弹层（issue #3）----
  '.pv_mask{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;' +
  'background:rgba(0,0,0,.42);padding:24px}' +
  '.pv_modal{width:min(520px,100%);box-sizing:border-box;display:flex;flex-direction:column;gap:10px;' +
  'padding:18px 20px;border-radius:14px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));' +
  'background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary);' +
  'box-shadow:var(--dsw-elevation-prominent,0 18px 48px rgba(0,0,0,.28))}' +
  '.pv_modalTitle{font-size:14px;font-weight:600;line-height:20px}' +
  '.pv_modalRow{display:flex;gap:12px;font-size:12px;line-height:19px}' +
  '.pv_modalLabel{flex:none;width:80px;color:var(--dsw-alias-label-tertiary)}' +
  '.pv_modalValue{flex:1 1 auto;min-width:0;word-break:break-word}' +
  '.pv_modalWarn{font-size:12px;line-height:18px;padding:8px 10px;border-radius:8px;' +
  'color:#a33;background:rgba(217,83,79,.12)}' +
  '.pv_modalActs{display:flex;justify-content:flex-end;gap:10px;margin-top:2px}' +
  '.pv_dangerBtn{color:#fff !important;background:#d9534f !important;border-color:#d9534f !important}' +
  '.pv_dangerBtn:disabled{opacity:.6;cursor:default}'

var tagId = 'dsh-llm-provider/plan.css'

/**
 * 挂样式：手写 style 标签（带 data-plugin-css 标记，重复调用幂等）。
 *
 * 不走官方 styles.insert：那个服务要 inject 'styles'，本插件没 inject 它，取 ctx.styles
 * 会直接抛（见 index.ts apply 里的注释）。手写标签是等价实现——静态插件运行时本来也只有
 * 这一条路。
 */
export function installCss(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') !== null) return
  var tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-llm-provider'
  tag.dataset.pluginCss = tagId
  tag.textContent = css
  document.head.appendChild(tag)
}

/** 测试环境标识：标题加「· 测试」后缀 + favicon 右下角盖橙色「测」角标。 */
export function markTestEnv() {
  try {
    // 后缀与角标都现取：判重与追加各自调一次 t()，切语言后加的仍是当前语言的那份
    if (document.title.indexOf(t('test.titleSuffix')) === -1) {
      document.title = (document.title === '' ? 'dsh' : document.title) + t('test.titleSuffix')
    }
    var iconLink = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    var img = new window.Image()
    img.onload = function () {
      var canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      var g = canvas.getContext('2d')
      if (g !== null && g !== undefined) {
        g.drawImage(img, 0, 0, 64, 64)
        g.fillStyle = '#e8890c'
        g.beginPath()
        g.arc(46, 46, 20, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#ffffff'
        g.font = 'bold 24px sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(t('test.faviconBadge'), 46, 48)
        setFavicon(canvas.toDataURL('image/png'))
        return
      }
      setFavicon(undefined)
    }
    img.onerror = function () { setFavicon(undefined) }
    img.src = iconLink === null ? '/favicon.ico' : iconLink.href
  } catch (cause) { /* 标不了就算了 */ }
}

/** 替换 favicon；dataUrl 为 undefined 时退到一个纯「测」字圆形 icon（文字也走字典）。 */
function setFavicon(dataUrl: string | undefined) {
  try {
    var link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (link === null || link === undefined) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    if (dataUrl !== undefined) {
      link.href = dataUrl
      return
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<circle cx="32" cy="32" r="30" fill="#e8890c"/>' +
      '<text x="32" y="43" font-size="30" font-weight="bold" fill="#fff" text-anchor="middle">' +
      t('test.faviconBadge') + '</text></svg>'
    link.href = 'data:image/svg+xml,' + encodeURIComponent(svg)
  } catch (cause) { /* 标不了就算了 */ }
}
