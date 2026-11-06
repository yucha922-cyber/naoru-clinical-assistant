import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { emptySession, sessionReducer, type Session, type SessionAction } from "./domain/session";

// アプリの状態。★ すべてメモリ上だけで保持し、ブラウザのストレージには保存しません。

export type Tab = "input" | "karte" | "document" | "selfcare";

type Settings = {
  /** 音声入力（Web Speech API）。外部で処理される可能性があるため既定は無効 */
  speechEnabled: boolean;
};

type Ctx = {
  session: Session;
  dispatch: (a: SessionAction) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
  toast: string | null;
  notify: (msg: string) => void;
  /** 一時保存（メモリ上のスナップショット） */
  snapshot: { savedAt: Date } | null;
  saveSnapshot: () => void;
  restoreSnapshot: () => void;
  /** AI取り込み直前の状態（元に戻す用） */
  undoImport: (() => void) | null;
  setUndoPoint: () => void;
  /** 読み込みに失敗した画像URL（公開データのみ。患者情報は含まない） */
  brokenImages: Set<string>;
  reportBrokenImage: (url: string) => void;
};

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children, initial }: { children: ReactNode; initial?: Session }) {
  const [session, dispatch] = useReducer(sessionReducer, initial ?? emptySession());
  const [tab, setTab] = useState<Tab>("input");
  const [settings, setSettings] = useState<Settings>({ speechEnabled: false });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const snapRef = useRef<Session | null>(null);
  const [snapshot, setSnapshot] = useState<{ savedAt: Date } | null>(null);
  const undoRef = useRef<Session | null>(null);
  const [hasUndo, setHasUndo] = useState(false);
  const [brokenImages, setBroken] = useState<Set<string>>(() => new Set());

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const saveSnapshot = useCallback(() => {
    snapRef.current = structuredClone(sessionRef.current);
    setSnapshot({ savedAt: new Date() });
    notify("一時保存しました（このタブを閉じると消えます）");
  }, [notify]);

  const restoreSnapshot = useCallback(() => {
    if (!snapRef.current) return;
    dispatch({ type: "replace", session: structuredClone(snapRef.current) });
    notify("一時保存した内容に戻しました");
  }, [notify]);

  const setUndoPoint = useCallback(() => {
    undoRef.current = structuredClone(sessionRef.current);
    setHasUndo(true);
  }, []);

  const undoImport = useCallback(() => {
    if (!undoRef.current) return;
    dispatch({ type: "replace", session: undoRef.current });
    undoRef.current = null;
    setHasUndo(false);
    notify("取り込み前の内容に戻しました");
  }, [notify]);

  const reportBrokenImage = useCallback((url: string) => {
    setBroken((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      session,
      dispatch,
      tab,
      setTab,
      settings,
      setSettings,
      toast,
      notify,
      snapshot,
      saveSnapshot,
      restoreSnapshot,
      undoImport: hasUndo ? undoImport : null,
      setUndoPoint,
      brokenImages,
      reportBrokenImage,
    }),
    [session, tab, settings, toast, notify, snapshot, saveSnapshot, restoreSnapshot, hasUndo, undoImport, setUndoPoint, brokenImages, reportBrokenImage],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- Provider とフックを同じファイルで管理する
export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("AppProvider の外で useApp が呼ばれました");
  return ctx;
}
