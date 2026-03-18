function updateQsoAtIndex(qsos, index, qso) {
  if (!Array.isArray(qsos) || !Number.isInteger(index) || index < 0 || index >= qsos.length) {
    return { success: false, error: 'Invalid index' };
  }

  const nextQsos = [...qsos];
  nextQsos[index] = qso;
  return { success: true, qsos: nextQsos };
}

function deleteQsoAtIndex(qsos, index) {
  if (!Array.isArray(qsos) || !Number.isInteger(index) || index < 0 || index >= qsos.length) {
    return { success: false, error: 'Invalid index' };
  }

  const nextQsos = [...qsos];
  nextQsos.splice(index, 1);
  return { success: true, qsos: nextQsos };
}

module.exports = {
  updateQsoAtIndex,
  deleteQsoAtIndex,
};
