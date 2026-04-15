import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    
    const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if caller is admin
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id)
      .single();
    
    if (roleData?.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Only admins can perform this action" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, user_id, email, password, full_name, redirect_to } = await req.json();

    if (action === "invite") {
      // Create user via admin API with email confirmation required
      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: "email and password are required for invite" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false, // User must confirm via email
        user_metadata: { full_name: full_name || email.split('@')[0] },
      });

      if (createError) throw createError;

      // Send the confirmation email by generating a signup link
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email,
        options: {
          redirectTo: redirect_to || `${supabaseUrl.replace('.supabase.co', '.lovable.app')}/auth`,
        },
      });

      if (linkError) {
        console.error("Error generating invite link:", linkError);
      }

      return new Response(
        JSON.stringify({ success: true, user_id: newUser.user?.id, message: "User created and invite email sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "resend_invite") {
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "user_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the user's email
      const { data: { user: targetUser }, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(user_id);
      
      if (getUserError || !targetUser) {
        return new Response(
          JSON.stringify({ error: "User not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Resend confirmation by generating a new signup link
      const { error: resendError } = await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email: targetUser.email!,
        options: {
          redirectTo: redirect_to || `${req.headers.get("origin") || ""}/auth`,
        },
      });

      if (resendError) throw resendError;

      return new Response(
        JSON.stringify({ success: true, message: "Invite email resent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "archive") {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ 
          archived: true, 
          archived_at: new Date().toISOString() 
        })
        .eq("user_id", user_id);

      if (profileError) throw profileError;

      const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        ban_duration: "876000h",
      });

      if (banError) throw banError;

      return new Response(
        JSON.stringify({ success: true, message: "User archived and disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } 
    
    if (action === "unarchive") {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ 
          archived: false, 
          archived_at: null 
        })
        .eq("user_id", user_id);

      if (profileError) throw profileError;

      const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        ban_duration: "0h",
      });

      if (unbanError) throw unbanError;

      return new Response(
        JSON.stringify({ success: true, message: "User unarchived and enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (action === "delete") {
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

      if (deleteError) throw deleteError;

      return new Response(
        JSON.stringify({ success: true, message: "User permanently deleted" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'invite', 'resend_invite', 'archive', 'unarchive', or 'delete'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
