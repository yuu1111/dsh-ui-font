/**
 * @description dsh-ui-font のホスト側
 *
 * 機能はすべてブラウザ側（テーマのトークン上書き）にあり この行はクライアント
 * バンドルを配信させるための有効な Loader エントリとしてだけ存在する
 * client-modules は有効なエントリの `dsh.client` バンドルだけを配信するため
 * 行そのものは必要だが サービス注入も設定も状態も持たせない
 */

/** 何もしないホスト側プラグイン */
export function apply(): void {}
