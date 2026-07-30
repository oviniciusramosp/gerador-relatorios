/* Vínculo live com arquivo local (.pdgm.zip / .json) — decisões puras.
 *
 * O browser não "assina" path no disco; o front só tem FileSystemFileHandle.
 * Poll / foco da aba usa lastModified: se o disco mudou e não há edição local
 * pendente, a UI recarrega. MCP/outro processo que grava o mesmo ficheiro
 * aparece na UI sem upload manual.
 */

/** Formato do projeto a partir do nome do arquivo (null = não é projeto). */
export function projectFormatFromName(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.json')) return 'pdgm-json';
  if (n.endsWith('.zip')) return 'pdgm';
  return null;
}

/**
 * Nome-base p/ download / suggestedName — tira sufixos conhecidos do projeto.
 *
 * `.replace(/\.[^.]+$/, '')` só remove a *última* extensão: com label
 * `foo.pdgm.zip` virava `foo.pdgm` + `.pdgm.zip` → `foo.pdgm.pdgm.zip`.
 *
 * Cobre: `.pdgm.zip`, Chrome `foo.pdgm (9).zip`, `.pdgm.json`, `.zip`/`.json`/
 * `.md`/`.txt`/`.pdf`, e sobras `.pdgm` (re-download de nome já quebrado).
 *
 * @param {string|null|undefined} name
 * @param {string} [fallback='diagramacao']
 */
export function projectBaseName(name, fallback = 'diagramacao') {
  let n = String(name || '').trim();
  if (!n) return fallback;
  // repete: "a.pdgm.pdgm.zip" → tira .pdgm.zip → "a.pdgm" → tira .pdgm → "a"
  // (e Chrome: "a.pdgm (2).zip" → "a")
  const once = (s) => s
    .replace(/\.pdgm(\s*\(\d+\))?\.zip$/i, '')
    .replace(/\.pdgm\.json$/i, '')
    .replace(/\.zip$/i, '')
    .replace(/\.json$/i, '')
    .replace(/\.md$/i, '')
    .replace(/\.txt$/i, '')
    .replace(/\.pdf$/i, '')
    .replace(/\.pdgm(\s*\(\d+\))?$/i, '');
  let prev;
  do {
    prev = n;
    n = once(n);
  } while (n !== prev);
  n = n.trim();
  return n || fallback;
}

/**
 * Deve a UI recarregar o doc a partir do disco?
 * @param {{ localDirty: boolean, writing: boolean, diskMtime: number, seenMtime: number }} s
 */
export function shouldReloadLinkedProject(s) {
  if (!s || s.localDirty || s.writing) return false;
  const disk = Number(s.diskMtime);
  const seen = Number(s.seenMtime);
  if (!Number.isFinite(disk) || !Number.isFinite(seen)) return false;
  return disk > seen;
}
