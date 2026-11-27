// Who may see and change what. The same rules the app follows on screen, enforced on the server.
//   Admin (trade marketing)  – everything
//   Vendor manager           – their own agency: its vendor record, people, outlets, entries and folders
//   Supervisor               – their agency's ambassadors, entries, folders and outlet assignments
//   Brand ambassador         – reads their agency; writes only their own entries and their own account

export const vendorOfRecord = (coll, data) => coll === "vendors" ? data.id : (data.vendorId || null);

export function canRead(user, coll, row) {
  if (user.role === "admin") return true;
  return !!user.vendorId && row.vendor_id === user.vendorId;
}

// Data sent to a phone never includes sign-in secrets.
export function publicData(coll, data) {
  if (coll !== "users" || !data || !("pw" in data)) return data;
  const { pw, ...rest } = data; return rest;
}

// Returns null when allowed, or a reason it was refused.
export function canWrite(user, coll, before, after) {
  if (user.role === "admin") {
    if (coll === "users" && before?.owner && after && (after.disabled || after.role !== "admin")) return "The owner account can't be switched off or changed from admin";
    return null;
  }
  const v = user.vendorId;
  if (!v) return "Account has no agency";
  const rec = after || before;
  // A record must stay inside the user's agency before and after the change.
  if (before && vendorOfRecord(coll, before) !== v) return "Outside your agency";
  if (after && vendorOfRecord(coll, after) !== v) return "Outside your agency";

  if (user.role === "manager") {
    if (coll === "vendors") return after && !before ? "Only admins add vendors" : (after?.removed && !before?.removed ? "Only admins remove vendors" : null);
    if (coll === "users") {
      if (rec.id === user.id) return after && after.role !== "manager" ? "You can't change your own role" : null;
      return ["ba", "supervisor"].includes(rec.role) && (!before || ["ba", "supervisor"].includes(before.role)) ? null : "Managers add ambassadors and supervisors only";
    }
    return null; // outlets, entries, folders in their agency
  }
  if (user.role === "supervisor") {
    if (coll === "vendors") return "Supervisors can't change the agency";
    if (coll === "users") {
      if (rec.id === user.id) return after && (after.role !== "supervisor" || after.disabled) ? "You can't change your own role" : null;
      return rec.role === "ba" && (!before || before.role === "ba") ? null : "Supervisors add ambassadors only";
    }
    if (coll === "outlets" && !before) return "Supervisors can't add outlets";
    return null;
  }
  if (user.role === "ba") {
    if (coll === "entries") return rec.baId === user.id && (!before || before.baId === user.id) ? null : "Ambassadors log their own activations only";
    if (coll === "users" && rec.id === user.id && after) {
      const same = k => (before?.[k] ?? null) === (after[k] ?? null);
      return ["role", "vendorId", "disabled", "login", "supervisorId"].every(same) ? null : "You can only change your own PIN";
    }
    return "Ambassadors can't change this";
  }
  return "Unknown role";
}
