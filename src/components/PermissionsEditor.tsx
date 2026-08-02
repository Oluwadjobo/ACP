import { useState, useEffect } from "react";
import { Shield, Loader2, Check } from "lucide-react";
import { api } from "@/lib/api";
import { FIELD_PERMISSIONS, DASHBOARD_PERMISSIONS, PERMISSION_LABELS, type Permission, type Permissions } from "@/types";

interface Props {
  userType: "admin" | "commercial" | "superviseur";
  userId: string;
  userLabel: string;
}

export function PermissionsEditor({ userType, userId, userLabel }: Props) {
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setPermissions(null);
    setError("");
    api.getPermissions(userType, userId).then((data) => setPermissions(data.permissions)).catch(() => setError("Erreur de chargement"));
  }, [userType, userId]);

  const toggle = (perm: Permission) => {
    if (!permissions) return;
    setPermissions({ ...permissions, [perm]: !permissions[perm] });
    setSuccess(false);
  };

  const save = async () => {
    if (!permissions) return;
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const result = await api.updatePermissions(userType, userId, permissions);
      setPermissions(result.permissions);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch {
      setError("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (!permissions) {
    return <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;
  }

  const renderGroup = (title: string, perms: Permission[]) => (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {perms.map((perm) => (
          <button
            key={perm}
            onClick={() => toggle(perm)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all text-left ${permissions[perm] ? "border-primary-300 bg-primary-50 text-primary-800" : "border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300"}`}
          >
            <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${permissions[perm] ? "bg-primary-600" : "bg-gray-300"}`}>
              {permissions[perm] && <Check size={12} className="text-white" />}
            </span>
            {PERMISSION_LABELS[perm]}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        <Shield size={16} className="text-primary-600" />
        Permissions de {userLabel}
      </div>
      {renderGroup("Terrain", FIELD_PERMISSIONS)}
      {renderGroup("Tableau de bord", DASHBOARD_PERMISSIONS)}
      {error && <p className="text-sm text-error-600">{error}</p>}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={save} disabled={saving} className="btn-primary text-sm py-2">
          {saving ? "Enregistrement..." : "Enregistrer les permissions"}
        </button>
        {success && <span className="text-sm text-success-600 flex items-center gap-1"><Check size={16} /> Enregistré</span>}
      </div>
    </div>
  );
}
