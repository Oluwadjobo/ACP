import { useEffect, useState } from "react";
import { UserPlus, Search, Pencil, KeyRound, Trash2, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AdminUser, Team } from "@/types";
import { Modal } from "@/components/Modal";
import { PermissionsEditor } from "@/components/PermissionsEditor";
import { formatDate } from "@/lib/format";

export function AdminAdmins() {
  const { isSuperAdmin } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [passwordModal, setPasswordModal] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [permsTarget, setPermsTarget] = useState<AdminUser | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const load = () => {
    setLoading(true);
    api.listAdmins().then(setAdmins).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (isSuperAdmin) api.listTeams().then(setTeams).catch(() => setTeams([]));
  }, [isSuperAdmin]);

  const filtered = admins.filter(
    (a) =>
      a.full_name.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] animate-slide-up rounded-xl border px-5 py-3 shadow-lg ${
          toast.type === "success" ? "bg-accent-50 border-accent-200 text-accent-700" : "bg-error-50 border-error-200 text-error-700"
        }`}>{toast.msg}</div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administrateurs</h1>
          <p className="text-gray-500 text-sm mt-1">Gérez les comptes administrateurs</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true); }} className="btn-primary">
          <UserPlus size={18} /> Ajouter
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" className="input pl-11" placeholder="Rechercher par nom ou email..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3"><Shield size={26} className="text-gray-400" /></div>
            <p className="text-gray-500 text-sm">Aucun administrateur trouvé</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((a) => (
              <div key={a.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                <div className="w-11 h-11 rounded-full bg-primary-100 flex items-center justify-center text-sm font-bold text-primary-700 flex-shrink-0">
                  {a.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{a.full_name}</p>
                    {a.must_change_password && <span className="badge bg-warning-50 text-warning-600">Mot de passe à changer</span>}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{a.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Créé le {formatDate(a.created_at)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { setEditing(a); setModalOpen(true); }} className="btn-ghost p-2 rounded-lg" title="Modifier"><Pencil size={16} /></button>
                  <button onClick={() => setPasswordModal(a)} className="btn-ghost p-2 rounded-lg" title="Réinitialiser le mot de passe"><KeyRound size={16} /></button>
                  <button onClick={() => setPermsTarget(a)} className="btn-ghost p-2 rounded-lg" title="Permissions"><Shield size={16} /></button>
                  <button onClick={() => setDeleteTarget(a)} className="btn-ghost p-2 rounded-lg text-error-500 hover:bg-error-50" title="Supprimer"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AdminModal open={modalOpen} editing={editing} teams={teams} isSuperAdmin={isSuperAdmin} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} showToast={showToast} />
      <PasswordModal admin={passwordModal} onClose={() => setPasswordModal(null)} onSaved={() => { setPasswordModal(null); showToast("success", "Mot de passe réinitialisé"); }} showToast={showToast} />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer l'administrateur" maxWidth="max-w-md">
        <p className="text-gray-600 text-sm mb-6">Êtes-vous sûr de vouloir supprimer <strong>{deleteTarget?.full_name}</strong> ? Cette opération est irréversible.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Annuler</button>
          <button onClick={async () => {
            if (!deleteTarget) return;
            try { await api.deleteAdmin(deleteTarget.id); setDeleteTarget(null); load(); showToast("success", "Administrateur supprimé"); }
            catch (err) { showToast("error", err instanceof Error ? err.message : "Erreur"); }
          }} className="btn-danger">Supprimer</button>
        </div>
      </Modal>

      <Modal open={!!permsTarget} onClose={() => setPermsTarget(null)} title="Permissions" maxWidth="max-w-2xl">
        {permsTarget && (
          <PermissionsEditor userType="admin" userId={permsTarget.id} userLabel={permsTarget.full_name} />
        )}
      </Modal>
    </div>
  );
}

function AdminModal({ open, editing, teams, isSuperAdmin, onClose, onSaved, showToast }: {
  open: boolean; editing: AdminUser | null; teams: Team[]; isSuperAdmin: boolean; onClose: () => void; onSaved: () => void; showToast: (type: "success" | "error", msg: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("admin");
  const [teamId, setTeamId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(editing?.email || "");
      setFullName(editing?.full_name || "");
      setPassword("");
      setRole(editing?.role || "admin");
      setTeamId(editing?.team_id || "");
    }
  }, [open, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.updateAdmin(editing.id, { email: email.trim(), full_name: fullName.trim(), ...(isSuperAdmin ? { role, team_id: teamId || null } : {}) });
        showToast("success", "Administrateur modifié");
      } else {
        if (password.length < 6) { showToast("error", "Mot de passe : 6 caractères minimum"); setSaving(false); return; }
        await api.createAdmin({ email: email.trim(), full_name: fullName.trim(), password, ...(isSuperAdmin ? { role, team_id: teamId || null } : {}) });
        showToast("success", "Administrateur créé");
      }
      onSaved();
    } catch (err) { showToast("error", err instanceof Error ? err.message : "Erreur"); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Modifier l'administrateur" : "Nouvel administrateur"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Nom complet</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Jean Dupont" />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="admin@exemple.com" />
        </div>
        {!editing && (
          <div>
            <label className="label">Mot de passe</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="6 caractères minimum" />
          </div>
        )}
        {isSuperAdmin && (
          <>
            <div>
              <label className="label">Rôle</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="admin">Administrateur d'équipe</option>
                <option value="super_admin">Super administrateur</option>
              </select>
            </div>
            <div>
              <label className="label">Équipe</label>
              <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">Vue globale</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </div>
          </>
        )}
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? "Enregistrement..." : editing ? "Enregistrer" : "Créer"}</button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({ admin, onClose, onSaved, showToast }: {
  admin: AdminUser | null; onClose: () => void; onSaved: () => void; showToast: (type: "success" | "error", msg: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setPassword(""); }, [admin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admin) return;
    if (password.length < 6) { showToast("error", "Mot de passe : 6 caractères minimum"); return; }
    setSaving(true);
    try { await api.resetAdminPassword(admin.id, password); onSaved(); }
    catch { showToast("error", "Erreur lors de la réinitialisation"); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={!!admin} onClose={onClose} title="Réinitialiser le mot de passe" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600">Définissez un nouveau mot de passe pour <strong>{admin?.full_name}</strong>. Il devra le changer à sa prochaine connexion.</p>
        <div>
          <label className="label">Nouveau mot de passe</label>
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="6 caractères minimum" autoFocus />
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? "Réinitialisation..." : "Réinitialiser"}</button>
        </div>
      </form>
    </Modal>
  );
}
