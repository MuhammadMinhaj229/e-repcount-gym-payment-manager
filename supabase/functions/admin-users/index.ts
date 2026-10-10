import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ROLE_TO_DB = {
  Admin_c: "admin",
  Manager_c: "manager",
  Staff_c: "staff",
};

const DB_TO_ROLE = {
  admin: "Admin_c",
  manager: "Manager_c",
  staff: "Staff_c",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getKeyFromMap(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.default === "string") return parsed.default;
      const first = Object.values(parsed).find((entry) => typeof entry === "string");
      return typeof first === "string" ? first : null;
    }
  } catch {
    // Legacy key variables are plain strings.
  }
  return null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey =
      getKeyFromMap(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")) ??
      Deno.env.get("SUPABASE_ANON_KEY");
    const secretKey =
      getKeyFromMap(Deno.env.get("SUPABASE_SECRET_KEYS")) ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !publishableKey || !secretKey) {
      return json(500, { error: "Supabase function secrets are not configured." });
    }

    const authorization = request.headers.get("Authorization") ?? "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) {
      return json(401, { error: "Sign in before managing users." });
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return json(401, { error: "Your session is invalid or expired. Sign in again." });
    }

    const admin = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const callerId = authData.user.id;
    const { data: callerMembership, error: callerError } = await admin
      .from("gym_users")
      .select("gym_id, role, status")
      .eq("user_id", callerId)
      .eq("status", "active")
      .maybeSingle();

    if (callerError || !callerMembership || callerMembership.role !== "admin") {
      return json(403, { error: "Only an active workspace Admin can manage accounts." });
    }

    const body = await request.json();
    const action = String(body.action ?? "");
    const gymId = callerMembership.gym_id;

    if (action === "list") {
      const { data: memberships, error: membershipsError } = await admin
        .from("gym_users")
        .select("user_id, role, status, created_at")
        .eq("gym_id", gymId)
        .order("created_at", { ascending: true });

      if (membershipsError) return json(500, { error: membershipsError.message });
      const ids = (memberships ?? []).map((item) => item.user_id);
      const { data: profiles, error: profilesError } = ids.length
        ? await admin.from("profiles").select("id, email, first_name, last_name").in("id", ids)
        : { data: [], error: null };

      if (profilesError) return json(500, { error: profilesError.message });
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      const data = (memberships ?? []).map((membership) => {
        const profile = profileById.get(membership.user_id);
        const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || "User";
        return {
          id: membership.user_id,
          userId: membership.user_id,
          name,
          email: profile?.email ?? "",
          profile: { name: DB_TO_ROLE[membership.role] ?? "Staff_c" },
          status: membership.status,
          createdOn: membership.created_at,
        };
      });

      return json(200, { data, total: data.length, hasMore: false });
    }

    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const firstName = String(body.firstName ?? "").trim();
      const lastName = String(body.lastName ?? "").trim();
      const profileName = String(body.profileName ?? "");
      const role = ROLE_TO_DB[profileName];

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(400, { error: "Enter a valid email address." });
      }
      if (password.length < 12) {
        return json(400, { error: "Use a password with at least 12 characters." });
      }
      if (!role) {
        return json(400, { error: "Choose a supported role: Admin, Manager or Staff." });
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      });
      if (createError || !created.user) {
        return json(400, { error: createError?.message ?? "The account could not be created." });
      }

      const newUserId = created.user.id;
      const { error: profileError } = await admin.from("profiles").upsert({
        id: newUserId,
        email,
        first_name: firstName,
        last_name: lastName,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(newUserId);
        return json(500, { error: "Profile creation failed; the partial account was rolled back." });
      }

      const { error: membershipError } = await admin.from("gym_users").insert({
        gym_id: gymId,
        user_id: newUserId,
        role,
        status: "active",
        created_by: callerId,
      });
      if (membershipError) {
        await admin.auth.admin.deleteUser(newUserId);
        return json(500, { error: "Workspace membership failed; the partial account was rolled back." });
      }

      return json(201, {
        data: {
          id: newUserId,
          userId: newUserId,
          name: [firstName, lastName].filter(Boolean).join(" ") || email,
          email,
          profile: { name: profileName },
          status: "active",
        },
      });
    }

    if (action === "update-role") {
      const targetUserId = String(body.userId ?? "");
      const profileName = String(body.profileName ?? "");
      const role = ROLE_TO_DB[profileName];
      if (!targetUserId || !role) return json(400, { error: "Choose a user and a supported role." });
      if (targetUserId === callerId) return json(400, { error: "For safety, you cannot change your own role here." });

      const { data: target, error: targetError } = await admin
        .from("gym_users")
        .select("user_id, role, status")
        .eq("gym_id", gymId)
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (targetError || !target) return json(404, { error: "That user is not in this workspace." });

      if (target.role === "admin" && role !== "admin") {
        const { count, error: countError } = await admin
          .from("gym_users")
          .select("user_id", { count: "exact", head: true })
          .eq("gym_id", gymId)
          .eq("status", "active")
          .eq("role", "admin");
        if (countError) return json(500, { error: countError.message });
        if ((count ?? 0) <= 1) return json(400, { error: "Keep at least one active Admin in the workspace." });
      }

      const { error: updateError } = await admin
        .from("gym_users")
        .update({ role, updated_at: new Date().toISOString() })
        .eq("gym_id", gymId)
        .eq("user_id", targetUserId);
      if (updateError) return json(500, { error: updateError.message });
      return json(200, { ok: true });
    }

    if (action === "delete") {
      const targetUserId = String(body.userId ?? "");
      if (!targetUserId) return json(400, { error: "Choose a user to remove." });
      if (targetUserId === callerId) return json(400, { error: "You cannot delete the account you're currently using." });

      const { data: target, error: targetError } = await admin
        .from("gym_users")
        .select("user_id, role, status")
        .eq("gym_id", gymId)
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (targetError || !target) return json(404, { error: "That user is not in this workspace." });

      if (target.role === "admin" && target.status === "active") {
        const { count, error: countError } = await admin
          .from("gym_users")
          .select("user_id", { count: "exact", head: true })
          .eq("gym_id", gymId)
          .eq("status", "active")
          .eq("role", "admin");
        if (countError) return json(500, { error: countError.message });
        if ((count ?? 0) <= 1) return json(400, { error: "Keep at least one active Admin in the workspace." });
      }

      const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId);
      if (deleteError) return json(500, { error: deleteError.message });
      return json(200, { ok: true });
    }

    return json(400, { error: "Unknown account-management action." });
  } catch (error) {
    console.error("admin-users failed:", error instanceof Error ? error.message : "Unknown error");
    return json(500, { error: "Unexpected account-management error." });
  }
});
