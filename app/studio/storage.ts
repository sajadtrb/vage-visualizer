import type { Project } from "./model";
export type Asset = { id: string; name: string; type: string; blob: Blob };
let connection: Promise<IDBDatabase> | undefined;
function db() {
  return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("vage-studio-v2", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("projects", { keyPath: "id" });
      r.result.createObjectStore("assets", { keyPath: "id" });
      r.result.createObjectStore("meta");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      connection = undefined;
      reject(r.error);
    };
  }));
}
async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const r = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(r.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error || new Error("Storage transaction aborted"));
  });
}
export const putAsset = (a: Asset) =>
  run("assets", "readwrite", (s) => s.put(a));
export const getAsset = (id: string) =>
  run<Asset | undefined>("assets", "readonly", (s) => s.get(id));
export const saveProject = (p: Project) =>
  run("projects", "readwrite", (s) => s.put(p));
export const allProjects = () =>
  run<Project[]>("projects", "readonly", (s) => s.getAll());
export const getProject = (id: string) =>
  run<Project | undefined>("projects", "readonly", (s) => s.get(id));
export const deleteProject = (id: string) =>
  run("projects", "readwrite", (s) => s.delete(id));
export const setActive = (id: string) =>
  run("meta", "readwrite", (s) => s.put(id, "active"));
export const getActive = () =>
  run<string | undefined>("meta", "readonly", (s) => s.get("active"));
