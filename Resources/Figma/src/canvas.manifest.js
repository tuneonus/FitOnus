export const manifest = {
  screens: {
    scr_z1faep: { name: "Splash", route: "/", state: { "screen": "splash" }, position: { "x": 160, "y": 220 } },
    scr_y7h6xd: { name: "Welcome", route: "/", state: { "screen": "welcome" }, position: { "x": 1560, "y": 220 } },
    scr_safwpb: { name: "Log in", route: "/", state: { "screen": "login" }, position: { "x": 2960, "y": 220 } },
    scr_niqodn: { name: "Sign up", route: "/", state: { "screen": "signup" }, position: { "x": 4360, "y": 220 } },
    scr_pqkw48: { name: "Forgot password", route: "/", state: { "screen": "forgotPassword" }, position: { "x": 5760, "y": 220 } },
    scr_rc4dn3: { name: "Reset password", route: "/", state: { "screen": "resetPassword" }, position: { "x": 7160, "y": 220 } },
    scr_54ub35: { name: "Account ready", route: "/", state: { "screen": "authSuccess" }, position: { "x": 8560, "y": 220 } },
    scr_l9vcmk: { name: "Onboarding", route: "/", state: { "screen": "onboarding" }, position: { "x": 9960, "y": 220 } },
    scr_5wox9t: { name: "Home", route: "/", state: { "screen": "home" }, position: { "x": 160, "y": 2200 } },
    scr_nwhiy2: { name: "Activity", route: "/", state: { "screen": "activity" }, position: { "x": 1560, "y": 2200 } },
    scr_jnxj0f: { name: "Running", route: "/", state: { "screen": "activityDetail", "params": { "type": "running" } }, position: { "x": 2960, "y": 2200 } },
    scr_nwrsq3: { name: "AI Coach", route: "/", state: { "screen": "coach" }, position: { "x": 160, "y": 4180 } },
    scr_kv1vdf: { name: "Conversations", route: "/", state: { "screen": "coachHistory" }, position: { "x": 1560, "y": 4180 } },
    scr_2rja8s: { name: "Past conversation", route: "/", state: { "screen": "coachConversation" }, position: { "x": 2960, "y": 4180 } },
    scr_mt8ox2: { name: "Voice Coach", route: "/", state: { "screen": "voiceCoach" }, position: { "x": 4360, "y": 4180 } },
    scr_bytfd5: { name: "Progress", route: "/", state: { "screen": "progress" }, position: { "x": 160, "y": 12100 } },
    scr_gt5w8x: { name: "Workouts", route: "/", state: { "screen": "workouts" }, position: { "x": 160, "y": 6160 } },
    scr_2khv0t: { name: "AI plan generator", route: "/", state: { "screen": "workoutGenerator" }, position: { "x": 1560, "y": 6160 } },
    scr_5sf23c: { name: "Workout plan", route: "/", state: { "screen": "workoutPlan" }, position: { "x": 2960, "y": 6160 } },
    scr_1yjxqu: { name: "Exercise library", route: "/", state: { "screen": "exerciseLibrary" }, position: { "x": 4360, "y": 6160 } },
    scr_r8mq79: { name: "Exercise detail", route: "/", state: { "screen": "exerciseDetail", "params": { "id": "bench" } }, position: { "x": 5760, "y": 6160 } },
    scr_dcwo68: { name: "Active workout", route: "/", state: { "screen": "activeWorkout" }, position: { "x": 7160, "y": 6160 } },
    scr_6gzdnj: { name: "Workout history", route: "/", state: { "screen": "workoutHistory" }, position: { "x": 8560, "y": 6160 } },
    scr_gpp9f3: { name: "Workout detail", route: "/", state: { "screen": "workoutHistoryDetail" }, position: { "x": 9960, "y": 6160 } },
    scr_k0k4ft: { name: "Personal records", route: "/", state: { "screen": "personalRecords" }, position: { "x": 11360, "y": 6160 } },
    scr_of9c8g: { name: "Nutrition", route: "/", state: { "screen": "nutrition" }, position: { "x": 160, "y": 8140 } },
    scr_bqkwdh: { name: "Food search", route: "/", state: { "screen": "foodSearch", "params": { "meal": "lunch" } }, position: { "x": 1560, "y": 8140 } },
    scr_m5jzg6: { name: "Food detail", route: "/", state: { "screen": "foodDetail", "params": { "meal": "lunch" } }, position: { "x": 2960, "y": 8140 } },
    scr_3sac6p: { name: "Barcode scanner", route: "/", state: { "screen": "barcodeScanner", "params": { "meal": "snacks" } }, position: { "x": 4360, "y": 8140 } },
    scr_sfu6od: { name: "Meal photo", route: "/", state: { "screen": "mealPhoto", "params": { "meal": "lunch" } }, position: { "x": 5760, "y": 8140 } },
    scr_y58vmv: { name: "Meal analysis", route: "/", state: { "screen": "mealAnalysis", "params": { "meal": "lunch" } }, position: { "x": 7160, "y": 8140 } },
    scr_lupfbk: { name: "Meal diary", route: "/", state: { "screen": "mealDiary" }, position: { "x": 8560, "y": 8140 } },
    scr_uoeqer: { name: "Weight", route: "/", state: { "screen": "weight" }, position: { "x": 160, "y": 10120 } },
    scr_j8viy9: { name: "Body measurements", route: "/", state: { "screen": "measurements" }, position: { "x": 1560, "y": 10120 } },
    scr_q0qkno: { name: "Sleep", route: "/", state: { "screen": "sleep" }, position: { "x": 2960, "y": 10120 } },
    scr_2uyra0: { name: "Recovery", route: "/", state: { "screen": "recovery" }, position: { "x": 4360, "y": 10120 } },
    scr_2dttvw: { name: "AI reports", route: "/", state: { "screen": "reports" }, position: { "x": 1560, "y": 12100 } },
    scr_57jpvs: { name: "Weekly report", route: "/", state: { "screen": "weeklyReport" }, position: { "x": 2960, "y": 12100 } },
    scr_m0m4mv: { name: "Monthly report", route: "/", state: { "screen": "monthlyReport" }, position: { "x": 4360, "y": 12100 } },
    scr_k3gyrn: { name: "Goals", route: "/", state: { "screen": "goals" }, position: { "x": 160, "y": 14080 } },
    scr_ram8mc: { name: "Create goal", route: "/", state: { "screen": "goalCreate" }, position: { "x": 1560, "y": 14080 } },
    scr_vc32mb: { name: "Goal detail", route: "/", state: { "screen": "goalDetail", "params": { "id": "g1" } }, position: { "x": 2960, "y": 14080 } },
    scr_yfy28k: { name: "AI memory", route: "/", state: { "screen": "aiMemory" }, position: { "x": 5760, "y": 4180 } },
    scr_2u10bf: { name: "Notifications", route: "/", state: { "screen": "notifications" }, position: { "x": 160, "y": 16060 } },
    scr_0f0sk9: { name: "Notification settings", route: "/", state: { "screen": "notificationPreferences" }, position: { "x": 1560, "y": 16060 } },
    scr_1k6m87: { name: "Health connections", route: "/", state: { "screen": "healthIntegration" }, position: { "x": 160, "y": 18040 } },
    scr_vnl7ys: { name: "Apple Watch", route: "/", state: { "screen": "appleWatch" }, position: { "x": 1560, "y": 18040 } },
    scr_e06aif: { name: "Profile", route: "/", state: { "screen": "profile" }, position: { "x": 160, "y": 20020 } },
    scr_372fvp: { name: "Personal information", route: "/", state: { "screen": "personalInfo" }, position: { "x": 1560, "y": 20020 } },
    scr_yam5l1: { name: "Fitness preferences", route: "/", state: { "screen": "fitnessPreferences" }, position: { "x": 2960, "y": 20020 } },
    scr_yo67zn: { name: "Nutrition preferences", route: "/", state: { "screen": "nutritionPreferences" }, position: { "x": 4360, "y": 20020 } },
    scr_erfl9n: { name: "Settings", route: "/", state: { "screen": "settings" }, position: { "x": 160, "y": 22000 } },
    scr_uqya9h: { name: "Appearance", route: "/", state: { "screen": "appearance" }, position: { "x": 1560, "y": 22000 } },
    scr_zke8dt: { name: "Privacy", route: "/", state: { "screen": "privacy" }, position: { "x": 2960, "y": 22000 } },
    scr_7jd167: { name: "Account", route: "/", state: { "screen": "account" }, position: { "x": 4360, "y": 22000 } },
    scr_dq3mw6: { name: "Sign-in error", route: "/", state: { "screen": "authError", "params": { "reason": "locked" } }, position: { "x": 11360, "y": 220 } },
    scr_p5r6vx: { name: "Workout complete", route: "/", state: { "screen": "workoutComplete" }, position: { "x": 12760, "y": 6160 } },
    scr_2kx4pd: { name: "Workout analytics", route: "/", state: { "screen": "workoutAnalytics" }, position: { "x": 5760, "y": 12100 } },
    scr_j9ypnw: { name: "Nutrition analytics", route: "/", state: { "screen": "nutritionAnalytics" }, position: { "x": 7160, "y": 12100 } },
    scr_11lvcp: { name: "Voice meal entry", route: "/", state: { "screen": "voiceMealEntry", "params": { "meal": "lunch" } }, position: { "x": 9960, "y": 8140 } },
    scr_766muo: { name: "Wear OS (future)", route: "/", state: { "screen": "wearOs" }, position: { "x": 2960, "y": 18040 } }
  },
  sections: {
    sec_dkxlo0: { name: "Authentication & Onboarding", x: 0, y: 0, width: 12720, height: 1180 },
    sec_yj9l5w: { name: "Main Dashboard", x: 0, y: 1980, width: 4320, height: 1180 },
    sec_f3z834: { name: "AI Coach & Conversations", x: 0, y: 3960, width: 7120, height: 1180 },
    sec_otzgkn: { name: "Workouts", x: 0, y: 5940, width: 14120, height: 1180 },
    sec_s5pqdj: { name: "Nutrition", x: 0, y: 7920, width: 11320, height: 1180 },
    sec_mugq5a: { name: "Health Metrics", x: 0, y: 9900, width: 5720, height: 1180 },
    sec_qr3sjl: { name: "Progress & Reports", x: 0, y: 11880, width: 8520, height: 1180 },
    sec_8b0ilq: { name: "Goals", x: 0, y: 13860, width: 4320, height: 1180 },
    sec_7p6643: { name: "Notifications", x: 0, y: 15840, width: 2920, height: 1180 },
    sec_2rviyu: { name: "Health Connections", x: 0, y: 17820, width: 4320, height: 1180 },
    sec_b7qbjv: { name: "Profile & Preferences", x: 0, y: 19800, width: 5720, height: 1180 },
    sec_fr7363: { name: "Settings", x: 0, y: 21780, width: 5720, height: 1180 }
  },
  layers: [
  { kind: "section", id: "sec_dkxlo0", children: [
    { kind: "screen", id: "scr_z1faep" },
    { kind: "screen", id: "scr_y7h6xd" },
    { kind: "screen", id: "scr_safwpb" },
    { kind: "screen", id: "scr_niqodn" },
    { kind: "screen", id: "scr_pqkw48" },
    { kind: "screen", id: "scr_rc4dn3" },
    { kind: "screen", id: "scr_54ub35" },
    { kind: "screen", id: "scr_l9vcmk" },
    { kind: "screen", id: "scr_dq3mw6" }]
  },
  { kind: "section", id: "sec_yj9l5w", children: [
    { kind: "screen", id: "scr_5wox9t" },
    { kind: "screen", id: "scr_nwhiy2" },
    { kind: "screen", id: "scr_jnxj0f" }]
  },
  { kind: "section", id: "sec_f3z834", children: [
    { kind: "screen", id: "scr_nwrsq3" },
    { kind: "screen", id: "scr_kv1vdf" },
    { kind: "screen", id: "scr_2rja8s" },
    { kind: "screen", id: "scr_mt8ox2" },
    { kind: "screen", id: "scr_yfy28k" }]
  },
  { kind: "section", id: "sec_otzgkn", children: [
    { kind: "screen", id: "scr_gt5w8x" },
    { kind: "screen", id: "scr_2khv0t" },
    { kind: "screen", id: "scr_5sf23c" },
    { kind: "screen", id: "scr_1yjxqu" },
    { kind: "screen", id: "scr_r8mq79" },
    { kind: "screen", id: "scr_dcwo68" },
    { kind: "screen", id: "scr_6gzdnj" },
    { kind: "screen", id: "scr_gpp9f3" },
    { kind: "screen", id: "scr_k0k4ft" },
    { kind: "screen", id: "scr_p5r6vx" }]
  },
  { kind: "section", id: "sec_s5pqdj", children: [
    { kind: "screen", id: "scr_of9c8g" },
    { kind: "screen", id: "scr_bqkwdh" },
    { kind: "screen", id: "scr_m5jzg6" },
    { kind: "screen", id: "scr_3sac6p" },
    { kind: "screen", id: "scr_sfu6od" },
    { kind: "screen", id: "scr_y58vmv" },
    { kind: "screen", id: "scr_lupfbk" },
    { kind: "screen", id: "scr_11lvcp" }]
  },
  { kind: "section", id: "sec_mugq5a", children: [
    { kind: "screen", id: "scr_uoeqer" },
    { kind: "screen", id: "scr_j8viy9" },
    { kind: "screen", id: "scr_q0qkno" },
    { kind: "screen", id: "scr_2uyra0" }]
  },
  { kind: "section", id: "sec_qr3sjl", children: [
    { kind: "screen", id: "scr_bytfd5" },
    { kind: "screen", id: "scr_2dttvw" },
    { kind: "screen", id: "scr_57jpvs" },
    { kind: "screen", id: "scr_m0m4mv" },
    { kind: "screen", id: "scr_2kx4pd" },
    { kind: "screen", id: "scr_j9ypnw" }]
  },
  { kind: "section", id: "sec_8b0ilq", children: [
    { kind: "screen", id: "scr_k3gyrn" },
    { kind: "screen", id: "scr_ram8mc" },
    { kind: "screen", id: "scr_vc32mb" }]
  },
  { kind: "section", id: "sec_7p6643", children: [
    { kind: "screen", id: "scr_2u10bf" },
    { kind: "screen", id: "scr_0f0sk9" }]
  },
  { kind: "section", id: "sec_2rviyu", children: [
    { kind: "screen", id: "scr_1k6m87" },
    { kind: "screen", id: "scr_vnl7ys" },
    { kind: "screen", id: "scr_766muo" }]
  },
  { kind: "section", id: "sec_b7qbjv", children: [
    { kind: "screen", id: "scr_e06aif" },
    { kind: "screen", id: "scr_372fvp" },
    { kind: "screen", id: "scr_yam5l1" },
    { kind: "screen", id: "scr_yo67zn" }]
  },
  { kind: "section", id: "sec_fr7363", children: [
    { kind: "screen", id: "scr_erfl9n" },
    { kind: "screen", id: "scr_uqya9h" },
    { kind: "screen", id: "scr_zke8dt" },
    { kind: "screen", id: "scr_7jd167" }]
  }]

};