# BiteN Go — How to use it

**Pre-order your lunch. Keep your seat on the ferry bus. One app.**

BiteN Go has two halves that share one login:

- **Smart canteen** — the canteen agent puts tomorrow's food on a board, you
  order it in advance, and the kitchen sees your ticket the moment you press
  send.
- **Ferry bus** — you take a seat for a whole month, and it is yours every day
  of that month. No booking again each morning.

This guide is for the people who *use* BiteN Go. If you are setting the system
up on a computer, read `README1.md` instead.

---

## Contents

1. [Opening BiteN Go and signing in](#1-opening-biten-go-and-signing-in)
2. [The buttons at the top of every screen](#2-the-buttons-at-the-top-of-every-screen)
3. [If you are a student](#3-if-you-are-a-student)
4. [If you are a canteen agent](#4-if-you-are-a-canteen-agent)
5. [If you are a transport agent](#5-if-you-are-a-transport-agent)
6. [If you are the office (administrator)](#6-if-you-are-the-office-administrator)
7. [Rules that catch people out](#7-rules-that-catch-people-out)
8. [If something looks wrong](#8-if-something-looks-wrong)
9. [Screen names in Myanmar](#9-screen-names-in-myanmar)

---

## 1. Opening BiteN Go and signing in

**On the computer running it:** open `http://localhost:5173`

**On your phone, on the same Wi-Fi:** open the address the office gives you —
something like `http://192.168.100.22:5173`. There is no app to install; it is
a website, and it is built to work on a phone screen.

### Signing in

Type the username and password you were given, and press **Sign in**.

- **Students** can also make their own account: press **Create an account** on
  the sign-in screen, fill in your name and choose a password.
- **Staff accounts** (canteen agent, transport agent, office) are created by
  the office. You cannot create one yourself.

You land straight on your own screens. A student never sees the office's
screens, and the office never sees a student's basket.

### Change your password

Go to **Profile** → *Change password*. Do this the first time you sign in with
a password somebody else chose for you.

Forgotten it? The office can set you a new one from **People**.

---

## 2. The buttons at the top of every screen

Top right, always in the same place, whoever you are:

| Button | What it does |
|---|---|
| **EN** / **မြန်** | switches the whole app between English and Myanmar |
| ☾ (moon) / ☀ (sun) | switches between the light and the dark look |
| ⚙ (gear) | your Profile |
| ⇥ (arrow) | signs you out |

Both switches take effect at once, on every screen, and your choice is
remembered on that phone or computer — so your phone can be in Myanmar and
dark while the office computer stays English and light.

The middle of the top bar shows the **Myanmar date and time** the system is
working to. That is the clock every rule below uses.

On a phone the menu is behind the **☰** button in the top-left corner, and the
main screens also sit along the bottom of the screen.

---

## 3. If you are a student

Your screens: **Dashboard · Canteen Menu · Meal Orders · Wallet · Ferry ·
My Ferry Pass · Profile**

### Ordering food

1. **Canteen Menu** shows what is on offer, with a photo and a price.
2. Press **+** on a dish to put it in your basket, **−** to take one out.
3. Check the basket on the right, choose how you are paying, and press
   **Place pre-order**.

**Two ways to pay:**

| | What happens |
|---|---|
| **Wallet** | the money comes out of your BiteN Go wallet straight away |
| **Cash at the counter** | you pay the agent when you collect; they confirm it |

**The ordering window is 12:00 PM to midnight, Myanmar time.** You are
ordering *tomorrow's* food, so the board opens at noon and closes at midnight.
Outside those hours the menu is empty and says so — that is not a fault.

**One agent at a time.** A single order cannot mix dishes from two different
canteen agents. Place a second order for the other agent.

### Following your order

**Meal Orders** shows every order and where it is: *pending → preparing →
ready → completed*. It refreshes itself every 30 seconds, so leave it open
while you wait.

### Your wallet

**Wallet** shows your balance and every movement, newest first, with the
running balance beside each one.

Money gets into your wallet when a **canteen agent tops it up** — you hand
them cash, they add it. The wallet is for the canteen only.

### Taking a ferry seat for the month

**Ferry** shows one card for each ferry road: where it goes, the two times it
runs every day, the price for a month, and how many seats are left.

1. Pick the road, then pick the **month** you want.
2. Press **Ask for the seat**. Nothing is charged.
3. **Ring the transport agent** on the number shown on the card and send them
   the fare the way you normally do.
4. They accept your seat once they have the money.

That seat is then yours **every day of that month** — both runs, no booking
again, nothing to show at the door except your pass.

> **The app never takes ferry money.** It is not in your wallet and it does not
> go through BiteN Go at all; it goes straight from you to the agent. So the
> app also cannot give it back — if you change your mind, that is between you
> and the agent.

**My Ferry Pass** prints your pass for each month you hold. A pass still
waiting shows the agent's phone number, so you always know who to call.

**Show route map** on the card draws the road on a real map, following real
streets, with the stops numbered in order.

---

## 4. If you are a canteen agent

Your screens: **Kitchen Display · Menu Board · Cash & Top-ups · Profile**

### Menu Board — your food

**Add dish** asks for a name, a price, a category and an optional description.
A new dish starts **hidden**; nobody can order it until you publish it.

**The availability box** on each row is how you publish:

| Setting | Means |
|---|---|
| **Available** | students can order it |
| **Sold out** | shown, but cannot be ordered |
| **Hidden** | students do not see it at all |

**You can only set a dish to "Available" between 12:00 PM and midnight**,
Myanmar time. That is the window students order tomorrow's food in. Outside it,
the option is greyed out and the screen tells you why.

### Photos

Each dish row has a small picture and an **Add photo** button. Take a photo of
the dish, choose it, and students see it on the menu straight away. **Change**
replaces it, **Remove** takes it off.

The photo is shrunk automatically before it is sent, so a picture straight off
your phone camera does not eat your data or make the menu slow. Photos need an
internet connection; everything else in BiteN Go does not.

### Kitchen Display — the day's cooking

Four lanes: **Incoming → Preparing → Ready → Completed**. Move a ticket along
with the button on it as the food is cooked and handed over.

**The order of the tickets is not the order they arrived.** A ticket rises up
the lane the longer it has waited, if the cash has not been collected yet, and
if it is a big order. The ones marked **ASAP** are the ones to cook now.

A ticket paid **cash at the counter** shows a **Confirm cash** button. Press it
when the student pays. Only a paid cash ticket can be marked completed.

The board refreshes itself every 15 seconds — leave it on a screen in the
kitchen and it stays current.

### Cash & Top-ups — money

**Float in hand** is what the office has given you, minus what you have paid
out. You cannot top up more than your float; ask the office for more funding.

**Top up a student** — choose the student, type the amount, press the button.
They can spend it immediately. Every movement is listed underneath with a
running balance, so the figures can always be traced.

---

## 5. If you are a transport agent

Your screens: **My Ferry · Road & Map · Profile**

Your ferry is yours. The office only opens and closes accounts — it does not
touch your bus, your road, your prices or your seats.

### First, three things to set up

1. **Profile → phone number.** Do this first. Students ring that number to pay
   you, so without it nobody can. My Ferry warns you while it is empty.
2. **My Ferry → Register your ferry bus**: plate number, model, how many seats.
   One bus per agent.
3. **Road & Map → open your road**: name, where it starts, where it ends, the
   pickup stops, the price of one seat for a month, the time it leaves in the
   morning, the time it comes back in the evening, and which months you are
   selling.

That is the whole setup. **There is no daily timetable to fill in** — the bus
runs those two times every day of every month you are selling.

### The map

On **Road & Map**, click the map to drop each stop in order; drag a numbered
pin to move it. The line follows real roads by itself, and tells you the real
distance and driving time. Press **Publish route line** and students see it.

### Seat requests

**My Ferry → Seat requests** lists students waiting for a seat.

1. The student rings you and sends the fare — outside the app, as always.
2. Once you have the money, press **Accept**.

Accepting only means *"this seat is yours for that month"*. **No money moves
through BiteN Go**, you hold no balance in it, and there is nothing to
reconcile. A request holds no seat until you accept it, so the seats-left count
does not drop while people are only asking.

### Months and seats

**My roads, month by month** shows how many seats are sold in each month.

- The **×** on the first or last month takes that month off sale — press it a
  few times to shorten the list. A month with seats already sold cannot be
  removed; cancel those seats first.
- **Seats on the bus** changes how many seats you sell. It will not go below
  what students have already paid for.

### If the bus breaks down

**Problems with the bus** → describe it. The bus is marked out of service and
students cannot take new seats until you close the report off.

---

## 6. If you are the office (administrator)

Your screens: **Overview · People · Transport · Canteen Ops · Cash Flow ·
Profile**

### People — the only accounts screen

Create staff accounts here: canteen agents, transport agents, and students if
you are adding them yourself. Accounts are **deactivated**, never deleted, so
the money history stays whole and auditable.

### Overview — the day at a glance

Money given to agents, what agents have paid out, the network balance, the
kitchen, and the ferry roads.

**Give money to an agent** is here: choose the agent, type the amount, send.
That is what fills their float so they can top up student wallets.

### Cash Flow — every movement

Every movement ever made, filterable by date and direction, each with the
running balance. A wrong entry can be deleted here.

### Transport — watching, not running

Buses, roads, monthly seats and fault reports, all read-only. **The transport
agents run their own ferries.** Your part is opening and closing their
accounts in **People**.

### Canteen Ops

Every order across all agents, and each agent's menu.

---

## 7. Rules that catch people out

These are all deliberate. If something will not let you do it, it is almost
certainly one of these.

| "Why can't I…" | Because |
|---|---|
| …see any food in the morning | The board is open **12:00 PM → midnight** only. You order tomorrow's food. |
| …publish a dish right now | Same window. Outside it the option is greyed out. |
| …order from two agents at once | One order, one agent. Place a second order. |
| …order with my wallet | The balance has to cover the whole basket. Ask an agent to top you up. |
| …complete a cash ticket | Press **Confirm cash** first. Money before food. |
| …see the ferry seats drop after asking | A request holds nothing until the agent accepts it. |
| …take two seats on one road in one month | One seat per road per month. Ask for more seats *in* that one request instead. |
| …get my ferry money back from the app | The app never had it. It went straight to the agent. |
| …remove a month in the middle of my list | Months are sold as one run. Remove from either end, or reset the months in Road & Map. |
| …see a photo on a dish | Photos need internet. Everything else works without it. |

---

## 8. If something looks wrong

**"Cannot reach the server" or the sidebar says "Not connected"**
The computer running BiteN Go is off, asleep, or on a different Wi-Fi. Ask
whoever runs it to start it again. Nothing you typed is lost.

**The page looks empty or odd after an update**
Refresh with **Ctrl + Shift + R** (or pull down to refresh on a phone).

**"Invalid username or password"**
Check for a stray space, and that Caps Lock is off. Still stuck — the office
can set you a new password from **People**.

**The time in the top bar is wrong**
Every rule uses Myanmar time from that clock, not your phone's. If it is
wrong, tell whoever runs the computer — the computer's clock is off.

**A photo will not upload**
The message on screen says which of the four things went wrong. The commonest
is simply no internet.

---

## 9. Screen names in Myanmar

Press **EN** in the top-right to switch the app to Myanmar. The main screens:

| English | မြန်မာ |
|---|---|
| Dashboard | ပင်မစာမျက်နှာ |
| Canteen Menu | စားသောက်ဆိုင် မီနူး |
| Meal Orders | မှာယူထားသော အစားအစာများ |
| Wallet | ပိုက်ဆံအိတ် |
| Ferry | ဖယ်ရီ |
| My Ferry Pass | ဖယ်ရီ လက်မှတ် |
| Kitchen Display | မီးဖိုချောင် ဘုတ် |
| Menu Board | မီနူး ဘုတ် |
| My Ferry | ကျွန်ုပ်၏ ဖယ်ရီ |
| Road & Map | လမ်းကြောင်းနှင့် မြေပုံ |
| People | အသုံးပြုသူများ |
| Cash Flow | ငွေကြေးစီးဆင်းမှု |
| Profile | ကိုယ်ရေးအချက်အလက် |
| Log out | ထွက်ရန် |

Any wording that reads badly can be corrected in one file —
`frontend/src/lib/i18n.ts`. Whoever set the system up can change the Burmese on
the right without touching anything else.

---

*BiteN Go — smart canteen and ferry bus, in one place.*
