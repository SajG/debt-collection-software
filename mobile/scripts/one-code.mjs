import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data } = await s.from("Profile").select('id, "ownerName"').eq("phone", "7774055316").single();
if (!data) { console.error("No profile"); process.exit(1); }

await s.from("EnrollmentCode").update({ consumedAt: new Date().toISOString() })
  .eq("profileId", data.id).is("consumedAt", null);

const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
let code = ""; for (let i=0;i<8;i++) code += ALPHA[Math.floor(Math.random()*ALPHA.length)];
const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
const hashHex = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2,"0")).join("");
await s.from("EnrollmentCode").insert({
  id: crypto.randomUUID().replace(/-/g,""),
  profileId: data.id, codeHash: hashHex, issuedById: data.id,
  expiresAt: new Date(Date.now()+60*60*1000).toISOString(),
});
console.log(`\n  ${data.ownerName} — Phone: 7774055316`);
console.log(`  Code:  ${code}\n  (1 hour)`);
