import type {Language} from './i18n.ts';
// Vite replaces this constant only in the static Pages build. Local/LAN builds are unchanged.
declare const __ROUGE_STATIC_HOST__: boolean;
export const STATIC_HOST = typeof __ROUGE_STATIC_HOST__ !== 'undefined' && __ROUGE_STATIC_HOST__;
export function hostingMessage(language:Language):string {
 return language === 'zh'
  ? '在线单人试玩版。局域网联机需下载源码并运行主机；存档保存在当前浏览器，可在设置中导出备份。'
  : 'Online single-player build. LAN requires a locally running host. Saves stay in this browser; export backups from Settings.';
}
export function HostingNotice({language}:{language:Language}) {
 return <p className="small muted" data-testid="hosting-notice">{hostingMessage(language)}</p>;
}
