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
