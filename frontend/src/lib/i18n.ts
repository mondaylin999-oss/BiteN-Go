// ===========================================================================
//  i18n.ts — English ⇄ Myanmar.
//
//  HOW IT WORKS
//  ------------
//  The key IS the English text. `t("Seat requests")` returns the Burmese when
//  the language is Myanmar and the exact English back when it is not, or when
//  a phrase has no translation yet. Nothing breaks if a line is missing — it
//  simply stays in English, so this file can be filled in over time.
//
//  TO CORRECT OR ADD A PHRASE
//  --------------------------
//  Find the English on the left and edit the Burmese on the right. That is the
//  whole job — no ids, no other file to touch. If you add a NEW English string
//  in a screen, add the same string here as a key.
//
//  Numbers, times, kyat amounts and people's names are never translated.
// ===========================================================================

export type Language = "en" | "my";

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  my: "မြန်မာ",
};

/** English → Myanmar. Anything not listed falls back to the English. */
export const MYANMAR: Record<string, string> = {
  // --- the shell, roles, navigation ----------------------------------------
  "BiteN Go": "BiteN Go",
  Dashboard: "ပင်မစာမျက်နှာ",
  "Canteen Menu": "စားသောက်ဆိုင် မီနူး",
  "Meal Orders": "မှာယူထားသော အစားအစာများ",
  Wallet: "ပိုက်ဆံအိတ်",
  Ferry: "ဖယ်ရီ",
  "Ferry Pass": "ဖယ်ရီ လက်မှတ်",
  "My Ferry": "ကျွန်ုပ်၏ ဖယ်ရီ",
  "Road & Map": "လမ်းကြောင်းနှင့် မြေပုံ",
  Profile: "ကိုယ်ရေးအချက်အလက်",
  Overview: "ခြုံငုံသုံးသပ်ချက်",
  People: "အသုံးပြုသူများ",
  Transport: "သယ်ယူပို့ဆောင်ရေး",
  "Canteen Ops": "စားသောက်ဆိုင် စီမံခန့်ခွဲမှု",
  "Cash Flow": "ငွေကြေးစီးဆင်းမှု",
  "Kitchen Display": "မီးဖိုချောင် ဘုတ်",
  "Menu Board": "မီနူး ဘုတ်",
  "My Float": "ကျွန်ုပ်၏ လက်ကျန်ငွေ",
  "System Switcher": "စနစ် ပြောင်းရန်",
  Current: "လက်ရှိ",
  Administrator: "စီမံခန့်ခွဲသူ",
  Student: "ကျောင်းသား",
  "Canteen agent": "စားသောက်ဆိုင် အေးဂျင့်",
  "Transport agent": "ဖယ်ရီ အေးဂျင့်",
  "Log out": "ထွက်ရန်",
  "Sign in": "ဝင်ရန်",
  "Sign out": "ထွက်ရန်",
  Connected: "ချိတ်ဆက်ပြီး",
  "Not connected — the server is not answering": "ချိတ်ဆက်မှု မရှိပါ — ဆာဗာ တုံ့ပြန်မှု မရှိပါ",
  Menu: "မီနူး",
  Close: "ပိတ်ရန်",
  Language: "ဘာသာစကား",
  Theme: "အသွင်အပြင်",
  "Dark mode": "အမှောင် အသွင်",
  "Light mode": "အလင်း အသွင်",

  // --- shared words --------------------------------------------------------
  Month: "လ",
  Months: "လများ",
  Seats: "ထိုင်ခုံများ",
  Seat: "ထိုင်ခုံ",
  Road: "လမ်းကြောင်း",
  Roads: "လမ်းကြောင်းများ",
  Status: "အခြေအနေ",
  Agent: "အေးဂျင့်",
  Student1: "ကျောင်းသား",
  Name: "အမည်",
  Phone: "ဖုန်းနံပါတ်",
  Price: "စျေးနှုန်း",
  Total: "စုစုပေါင်း",
  Today: "ယနေ့",
  "Every day": "နေ့စဉ်",
  Morning: "မနက်",
  Evening: "ညနေ",
  Save: "သိမ်းရန်",
  Cancel: "ပယ်ဖျက်ရန်",
  Accept: "လက်ခံရန်",
  Refuse: "ငြင်းပယ်ရန်",
  Confirm: "အတည်ပြုရန်",
  Add: "ထည့်ရန်",
  Remove: "ဖယ်ရှားရန်",
  Update: "ပြင်ဆင်ရန်",
  Refresh: "ပြန်လည်ရယူရန်",
  "Try again": "ထပ်စမ်းကြည့်ပါ",
  Loading: "ခဏစောင့်ပါ",
  "Loading…": "ခဏစောင့်ပါ…",
  Waiting: "စောင့်ဆိုင်းဆဲ",
  Confirmed: "အတည်ပြုပြီး",
  Cancelled: "ပယ်ဖျက်ပြီး",
  Pending: "စောင့်ဆိုင်းဆဲ",
  Active: "လုပ်ဆောင်ဆဲ",
  Inactive: "ရပ်ဆိုင်းထား",
  Available: "ရရှိနိုင်သည်",
  Unavailable: "မရရှိနိုင်ပါ",
  "Sold out": "ကုန်သွားပြီ",
  Preparing: "ပြင်ဆင်နေဆဲ",
  Ready: "အဆင်သင့်",
  Completed: "ပြီးဆုံးပြီး",
  Operational: "အသုံးပြုနိုင်သည်",
  Maintenance: "ပြုပြင်ထိန်းသိမ်းရေး",
  Reported: "တင်ပြထားသည်",
  Resolved: "ဖြေရှင်းပြီး",

  // --- sign in -------------------------------------------------------------
  "Smart Canteen & Ferry": "စမတ် စားသောက်ဆိုင်နှင့် ဖယ်ရီ",
  Username: "အသုံးပြုသူအမည်",
  Password: "စကားဝှက်",
  "Signing in…": "ဝင်ရောက်နေသည်…",
  "Create an account": "အကောင့်အသစ် ဖွင့်ရန်",
  "Campus smart canteen pre-ordering and ferry bus seat booking.": "ကျောင်းတွင်း စားသောက်ဆိုင် ကြိုတင်မှာယူခြင်းနှင့် ဖယ်ရီ ထိုင်ခုံ ကြိုတင်စာရင်းသွင်းခြင်း။",

  // --- ferry, student ------------------------------------------------------
  "Ferry Tracking": "ဖယ်ရီ ခြေရာခံ",
  "Ferry roads": "ဖယ်ရီ လမ်းကြောင်းများ",
  "Seats free": "လွတ်နေသော ထိုင်ခုံများ",
  "My requests": "ကျွန်ုပ်၏ တောင်းဆိုမှုများ",
  "My ferry months": "ကျွန်ုပ်၏ ဖယ်ရီ လများ",
  "Ferry leaves": "ဖယ်ရီ ထွက်ချိန်",
  "Ferry bus": "ဖယ်ရီ ကား",
  "Ask for the seat": "ထိုင်ခုံ တောင်းဆိုရန်",
  "Give it up": "ထိုင်ခုံ စွန့်လွှတ်ရန်",
  "Show route map": "လမ်းကြောင်း မြေပုံ ကြည့်ရန်",
  "Hide route map": "မြေပုံ ဖျောက်ရန်",
  "Open in OpenStreetMap": "OpenStreetMap တွင် ဖွင့်ရန်",
  "No passes yet": "လက်မှတ် မရှိသေးပါ",
  "No ferry road yet": "ဖယ်ရီ လမ်းကြောင်း မရှိသေးပါ",
  "Good for every departure of the month": "ထိုလအတွင်း ခရီးစဉ်တိုင်း အသုံးပြုနိုင်သည်",
  "Agreed with the agent": "အေးဂျင့်နှင့် သဘောတူညီထားသည်",
  "Paid to the agent directly, not through the app": "အေးဂျင့်ထံ တိုက်ရိုက် ပေးချေရန် — အက်ပ်မှတစ်ဆင့် မဟုတ်ပါ",

  // --- ferry, agent --------------------------------------------------------
  "Seat requests": "ထိုင်ခုံ တောင်းဆိုမှုများ",
  "Register your ferry bus": "သင့် ဖယ်ရီကား မှတ်ပုံတင်ရန်",
  "Seats on the bus": "ကားပေါ်မှ ထိုင်ခုံအရေအတွက်",
  "Update the seat count": "ထိုင်ခုံအရေအတွက် ပြင်ဆင်ရန်",
  "Problems with the bus": "ကား ပြဿနာများ",
  "My roads, month by month": "ကျွန်ုပ်၏ လမ်းကြောင်းများ — လအလိုက်",
  "Seats sold": "ရောင်းပြီး ထိုင်ခုံ",
  "Waiting requests": "စောင့်ဆိုင်းနေသော တောင်းဆိုမှုများ",
  "Seats left this month": "ယခုလ ကျန်ရှိသော ထိုင်ခုံ",
  "Open problems": "မဖြေရှင်းရသေးသော ပြဿနာများ",
  "I am available": "ကျွန်ုပ် အားနေသည်",
  "Not available": "အားမနေပါ",
  "Leaves in the morning": "မနက် ထွက်ချိန်",
  "Comes back in the evening": "ညနေ ပြန်ချိန်",
  "Selling from": "ရောင်းစတင်မည့်လ",
  "Selling until": "ရောင်းပြီးဆုံးမည့်လ",
  "Road name": "လမ်းကြောင်း အမည်",
  "Start point": "စတင်မည့်နေရာ",
  Destination: "ဆုံးမှတ်",
  "Pickup stops": "ကြိုမည့် မှတ်တိုင်များ",
  "Open the road": "လမ်းကြောင်း ဖွင့်ရန်",
  "Save route": "လမ်းကြောင်း သိမ်းရန်",
  "Route line": "လမ်းကြောင်း မျဉ်း",
  "Publish route line": "လမ်းကြောင်းမျဉ်း တင်ရန်",
  "Add point": "အမှတ် ထည့်ရန်",
  Colour: "အရောင်",
  "Total seats": "စုစုပေါင်း ထိုင်ခုံ",
  "Report a problem": "ပြဿနာ တင်ပြရန်",

  // --- canteen -------------------------------------------------------------
  "Daily Menu": "နေ့စဉ် မီနူး",
  "Your Order": "သင့် မှာယူမှု",
  "Place pre-order": "ကြိုတင်မှာယူရန်",
  "Pre-orders open": "ကြိုတင်မှာယူချိန် ဖွင့်ထားသည်",
  "Window closed": "မှာယူချိန် ပိတ်ထားသည်",
  "Add a dish": "အစားအစာ ထည့်ရန်",
  "Open orders": "ပြီးမြောက်ရန် ကျန်သော မှာယူမှုများ",
  Incoming: "အသစ်ဝင်လာသည်",
  "Mark ready": "အဆင်သင့် အဖြစ် မှတ်ရန်",
  "Wallet payment": "ပိုက်ဆံအိတ်ဖြင့် ပေးချေမှု",
  "Cash payment": "ငွေသားဖြင့် ပေးချေမှု",
  "Confirm cash": "ငွေသား လက်ခံရရှိကြောင်း အတည်ပြုရန်",

  // --- food photos ---------------------------------------------------------
  Photo: "ဓာတ်ပုံ",
  "Add photo": "ဓာတ်ပုံ ထည့်ရန်",
  Change: "ပြောင်းရန်",
  Dish: "အစားအစာ",
  Category: "အမျိုးအစား",
  Published: "တင်ပြီး",
  "On the board": "ဘုတ်ပေါ်တွင်",
  "Average price": "ပျမ်းမျှ စျေးနှုန်း",
  "Your dishes": "သင့် အစားအစာများ",
  "Add dish": "အစားအစာ ထည့်ရန်",
  "Add a dish": "အစားအစာ တစ်ခု ထည့်ရန်",
  "Add to board": "ဘုတ်ပေါ် တင်ရန်",
  "Nothing on the board yet": "ဘုတ်ပေါ်တွင် ဘာမျှ မရှိသေးပါ",

  // --- money ---------------------------------------------------------------
  Received: "လက်ခံရရှိငွေ",
  "Paid out": "ထုတ်ပေးငွေ",
  Balance: "လက်ကျန်ငွေ",
  Profit: "အမြတ်",
  "Cash in hand": "လက်ကျန် ငွေသား",
  "Give money to an agent": "အေးဂျင့်ထံ ငွေ ခွဲဝေရန်",
  "Pay a student": "ကျောင်းသားထံ ငွေပေးရန်",
  Amount: "ပမာဏ",
  Note: "မှတ်ချက်",
  History: "မှတ်တမ်း",
  "Add money": "ငွေ ထည့်ရန်",
  "This month": "ယခုလ",

  // --- people --------------------------------------------------------------
  "Add an account": "အကောင့် ဖွင့်ရန်",
  Role: "ရာထူး",
  Deactivate: "ပိတ်ရန်",
  Activate: "ဖွင့်ရန်",
  "Accounts the office opens and closes": "ရုံးမှ ဖွင့်ပိတ်သော အကောင့်များ",
};

export function translate(text: string, language: Language) {
  if (language === "en") return text;
  return MYANMAR[text] ?? text;
}
