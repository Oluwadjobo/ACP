-- Remove 8 confirmed doublons from OPLANETE team
-- 7 were created by William (superviseur) in 13Coo_ABOMEY CALAVI, duplicating points
--   already created by Ephreme (Sanni sector) or Albéric (AKPAKPA sector)
-- 1 was created by Albéric himself (MAG AUGUST / MAG AUGUST DÉPÔT)
-- All 8 have zero visites, ventes, BLs, controles, commandes, livraisons, promesses

-- The originals (kept) and their duplicates (removed):
-- 1. Just trading dépôt:  PV-45B9Z (Sanni)      ← PV-EGZK3 (13Coo, William)  6.8m
-- 2. Anoel dépôt:         PV-XKK47 (Sanni)      ← PV-KVYTX (13Coo, William)  8.6m
-- 3. Benedictus Akoibi:   PV-G0ZHN (Sanni)      ← PV-PQAZC (13Coo, William) 14.9m
-- 4. Stan Business:       PV-6R4S4 (Sanni)      ← PV-XO6B6 (13Coo, William) 15.5m
-- 5. Ets BON PRIX:        PV-FDYK3 (Albéric)    ← PV-3TV0O (13Coo, William) 17.1m
-- 6. St barakah/Barakath: PV-IMWKV (Sanni)     ← PV-BW8TY (13Coo, William) 20.4m
-- 7. Nidas:               PV-KV99H (Sanni)      ← PV-XRX76 (13Coo, William) 31.6m
-- 8. MAG AUGUST:          PV-43GT6 (Albéric)    ← PV-9QM24 (Albéric)         9.5m

DELETE FROM points_vente WHERE id IN (
  'df90d359-ffb5-4261-8cef-fe6de4e4f4e9',
  '4bfe6c54-924a-4830-aaae-34a004e561a3',
  'b4b2cdc0-fc14-4e52-af61-ffd0a700aa9e',
  '040e2e6f-4a94-426a-bc93-b79708a8b646',
  '9a79a5c5-81bf-4cca-af13-3b96a260c4a0',
  'd0245699-1301-437a-9800-0dfeb28426d1',
  '680d7e5c-e8c7-498e-bc13-ffb8898ea9cd',
  '7e3fe276-94cf-4547-82cb-2e647a72f840'
);
