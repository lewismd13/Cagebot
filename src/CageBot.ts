import { Mutex } from "async-mutex";
import { KoLClan, KoLClient, KoLUser, PrivateMessage } from "./KoLClient";

type CagedStatus = {
  requester: KoLUser;
  clan: string;
  cagedAt: number;
};

const mutex = new Mutex();

export class CageBot {
  private _privateMessages: PrivateMessage[] = [];
  private _client: KoLClient;
  private _amCaged: boolean = false;
  private _cageStatus?: CagedStatus;

  constructor(username: string, password: string) {
    this._client = new KoLClient(username, password);
  }

  start(): void {
    console.log("Starting BAFHbot...");
    this.initialSetup().then(() => {
      console.log("Initial setup complete. Polling messages.");
      setInterval(
        async () => this._privateMessages.push(...(await this._client.fetchNewWhispers())),
        3000
      );
      this.processMessage();
    });
  }

  async initialSetup(): Promise<void> {
    // put a check to make sure we're in the right clan here
    const clan = await this._client.myClan();
    const correctclan: KoLClan = { name: "Bonus Adventures From Hell", id: "90485" };
    if (clan !== "Bonus Adventures From Hell") {
      await this._client.joinClan(correctclan);
    }
  }

  async processMessage(): Promise<void> {
    const message = this._privateMessages.shift();
    if (message) {
      await mutex.runExclusive(async () => {
        console.log(`Processing whisper from ${message.who.name} (#${message.who.id})`);
        const processedMsg = message.msg.toLowerCase();
        if (processedMsg.startsWith("status")) await this.statusReport(message, true);
        else if (processedMsg.startsWith("whitelist")) await this.whitelistBafh(message);
        else if (processedMsg.startsWith("dungeon")) await this.updateRank(message);
        else if (processedMsg.startsWith("help")) await this.helpText(message);
        else await this.didntUnderstand(message);
      });
      this.processMessage();
    } else setTimeout(() => this.processMessage(), 1000);
  }

  async whitelistBafh(message: PrivateMessage): Promise<void> {
    console.log(`Whitelisting ${message.who.name} to BAFH`);
    await this._client.visitUrl(
      `clan_whitelist.php?action=add`,
      { addwho: message.who.name, level: 0, title: "beepboop" },
      true
    );
    await this._client.sendPrivateMessage(message.who, "Welcome to Bonus Hell!");
  }

  async updateRank(message: PrivateMessage): Promise<void> {
    console.log(`Giving ${message.who.name} dungeon privileges`);
    await this._client.visitUrl(
      `clan_members.php?action=modify&pids[]=${message.who.id}&level${message.who.id}=2`,
      {},
      true
    );
    await this._client.sendPrivateMessage(
      message.who,
      "You can now adventure in BAFH dungeons. Please behave!"
    );
  }

  async becomeCaged(message: PrivateMessage): Promise<void> {
    const clanName = message.msg.slice(5);
    console.log(`${message.who.name} (#${message.who.id}) requested caging in clan "${clanName}"`);
    if (this._amCaged) {
      console.log(`Already caged. Sending status report instead.`);
      await this.statusReport(message);
    } else {
      const whitelists = (await this._client.getWhitelists()).filter((clan: KoLClan) =>
        clan.name.toLowerCase().includes(clanName.toLowerCase())
      );
      if (whitelists.length > 1) {
        console.log(`Clan name "${clanName}" ambiguous, aborting.`);
        this._client.sendPrivateMessage(
          message.who,
          `I'm in multiple clans named ${clanName}: ${whitelists.join(
            ", "
          )}. Please be more specific.`
        );
      } else if (whitelists.length < 1) {
        console.log(`Clan name "${clanName}" does not match any whitelists, aborting.`);
        this._client.sendPrivateMessage(
          message.who,
          `I'm not in any clans named ${clanName}. Check your spelling, or ensure I have a whitelist.`
        );
      } else {
        const targetClan = whitelists[0];
        console.log(
          `Clan name "${clanName}" matched to whitelisted clan "${targetClan.name}". Attempting to whitelist.`
        );
        await this._client.joinClan(targetClan);
        if ((await this._client.myClan()) !== targetClan.id) {
          console.log(`Whitelisting to clan "${targetClan.name}" failed, aborting.`);
          await this._client.sendPrivateMessage(
            message.who,
            `I tried to whitelist to ${targetClan.name}, but was unable to. Did I accidentally become a clan leader?`
          );
        } else {
          if (!/Old Sewers/.test(await this._client.visitUrl("clan_hobopolis.php"))) {
            console.log(`Sewers in clan "${targetClan.name}" inaccessible, aborting.`);
            await this._client.sendPrivateMessage(
              message.who,
              `I can't seem to access the sewers in ${targetClan.name}. Is Hobopolis open? Do I have the right permissions?`
            );
          } else {
            let grates = 0;
            let valves = 0;
            const startAdv = await this._client.getAdvs();
            await this._client.sendPrivateMessage(
              message.who,
              `Attempting to get caged in ${targetClan.name}.`
            );
            console.log(`Beginning turns in ${targetClan.name} sewers.`);
            while (
              !this._amCaged &&
              (await this._client.getAdvs()) > 11 &&
              (await this._client.getDrunk()) <= 14
            ) {
              const adventureResponse = await this._client.visitUrl("adventure.php", {
                snarfblat: 166,
              });
              if (/Despite All Your Rage/.test(adventureResponse)) {
                this._amCaged = true;
                await this._client.visitUrl("choice.php", {
                  whichchoice: 211,
                  option: 2,
                });
                console.log(`Caged!`);
              } else if (/Disgustin\' Junction/.test(adventureResponse)) {
                await this._client.visitUrl("choice.php", {
                  whichchoice: 198,
                  option: 3,
                });
                grates += 1;
                console.log(`Opened grate. Grate(s) so far: ${grates}.`);
              } else if (/Somewhat Higher and Mostly Dry/.test(adventureResponse)) {
                await this._client.visitUrl("choice.php", {
                  whichchoice: 197,
                  option: 3,
                });
                valves += 1;
                console.log(`Opened valve. Valve(s) so far: ${valves}.`);
              } else if (/The Former or the Ladder/.test(adventureResponse)) {
                await this._client.visitUrl("choice.php", {
                  whichchoice: 199,
                  option: 3,
                });
              } else if (/Pop!/.test(adventureResponse)) {
                await this._client.visitUrl("choice.php", {
                  whichchoice: 296,
                  option: 1,
                });
              }
              if (!this._amCaged && /whichchoice/.test(await this._client.visitUrl("place.php"))) {
                console.log(
                  `Unexpectedly still in a choice after running possible choices. Aborting.`
                );
                break;
              }
            }
            if (this._amCaged) {
              this._cageStatus = {
                clan: targetClan.name,
                requester: message.who,
                cagedAt: Date.now(),
              };
              console.log(`Successfully caged in clan ${targetClan.name}. Reporting success.`);
              await this._client.sendPrivateMessage(
                message.who,
                `Clang! I am now caged in ${targetClan.name}. Release me later by whispering "escape" to me.`
              );
            } else if (!(await this.advLeft(message))) {
              console.log(
                `Ran out of adventures attempting to get caged in clan ${targetClan.name}. Aborting.`
              );
              await this._client.sendPrivateMessage(
                message.who,
                `I ran out of adventures trying to get caged in ${targetClan.name}.`
              );
            } else {
              console.log(
                `Unexpected error occurred attempting to get caged in clan ${targetClan.name}. Aborting.`
              );
              await this._client.sendPrivateMessage(
                message.who,
                `Something unspecified went wrong while I was trying to get caged in ${targetClan.name}. Good luck.`
              );
            }
            const endAdvs = await this._client.getAdvs();
            const spentAdvs = startAdv - endAdvs;
            await this._client.sendPrivateMessage(
              message.who,
              `I opened ${grates} grate${grates === 1 ? "" : "s"} and turned ${valves} valve${
                valves === 1 ? "" : "s"
              } on the way, and spent ${spentAdvs} adventure${
                spentAdvs === 1 ? "" : "s"
              } (${endAdvs} remaining).`
            );
          }
        }
      }
    }
  }

  async escapeCage(message: PrivateMessage): Promise<void> {
    console.log(`${message.who.name} (#${message.who.id}) requested escape from cage.`);
    if (!this._amCaged || (this._cageStatus && this._cageStatus.requester.id !== message.who.id)) {
      if (!this._amCaged) console.log(`Not currently caged, sending status report instead.`);
      else console.log(`User not authorised to initiate escape, sending status report instead.`);
      await this.statusReport(message);
    } else {
      await this.chewOut();
      console.log(`Successfully chewed out of cage. Reporting success.`);
      await this._client.sendPrivateMessage(message.who, "Chewed out! I am now uncaged.");
    }
  }

  async releaseCage(message: PrivateMessage): Promise<void> {
    console.log(`${message.who.name} (#${message.who.id}) requested release from cage.`);
    if (
      !this._amCaged ||
      (this._cageStatus && !this.releaseable() && message.who.id !== this._cageStatus.requester.id)
    ) {
      if (!this._amCaged) console.log(`Not currently caged, sending status report instead.`);
      else console.log(`Release timer has not yet expired, sending status report instead.`);
      await this.statusReport(message);
    } else {
      const prevStatus = this._cageStatus;
      await this.chewOut();
      console.log(`Successfully chewed out of cage. Reporting success.`);
      await this._client.sendPrivateMessage(message.who, "Chewed out! I am now uncaged.");
      if (prevStatus && prevStatus.requester.id !== message.who.id) {
        console.log(
          `Reporting release to original requester ${prevStatus.requester.name} (#${prevStatus.requester.id}).`
        );
        await this._client.sendPrivateMessage(
          prevStatus.requester,
          `I chewed out of the Hobopolis instance in ${prevStatus.clan} due to recieving a release command after being left in for more than an hour. YOUR CAGE IS NOW UNBAITED.`
        );
      }
    }
  }

  async helpText(message: PrivateMessage): Promise<void> {
    console.log(`${message.who.name} (#${message.who.id}) requested help.`);
    await this._client.sendPrivateMessage(
      message.who,
      `Hi! I am ${this._client.getMe()?.name} (#${
        this._client.getMe()?.id
      }), and I am running a hacked apart version of Phillammon's Cagebot script.`
    );
    await this._client.sendPrivateMessage(message.who, `My commands:`);
    await this._client.sendPrivateMessage(message.who, `- status: Get my current status`);
    await this._client.sendPrivateMessage(
      message.who,
      `- whitelist: get whitelisted to Bonus Adventures From Hell`
    );
    await this._client.sendPrivateMessage(
      message.who,
      `- dungeon: get clan dungeon privileges in BafH. Note: you must currently be in BafH for this to work`
    );
    await this._client.sendPrivateMessage(message.who, `- help: Displays this message.`);
  }

  async statusReport(message: PrivateMessage, directlyRequested: boolean = false): Promise<void> {
    if (directlyRequested)
      console.log(`${message.who.name} (#${message.who.id}) requested status report.`);
    //always send info on how full the bot is.
    //todo: assumes max values. Should check for actual
    await this._client.sendPrivateMessage(
      message.who,
      `My current status is: waiting for the downfall of the auto industry. Hello v1`
    );
  }

  async didntUnderstand(message: PrivateMessage): Promise<void> {
    console.log(`${message.who.name} (#${message.who.id}) made an incomprehensible request.`);
    await this._client.sendPrivateMessage(
      message.who,
      `I'm afraid I didn't understand that. Whisper me "help" for details of how to use me.`
    );
  }

  humanReadableTime(seconds: number): string {
    return `${Math.floor(seconds / 3600)}:${Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0")}`;
  }

  secondsInCage(): number {
    if (!this._cageStatus) throw "Tried to find time in cage with no cagestatus.";
    return (Date.now() - this._cageStatus.cagedAt) / 1000;
  }

  releaseable(): boolean {
    return this.secondsInCage() > 3600;
  }

  async chewOut(): Promise<void> {
    const adventureResponse = await this._client.visitUrl("adventure.php", {
      snarfblat: 166,
    });

    if (/Despite All Your Rage/.test(adventureResponse)) {
      await this._client.visitUrl("choice.php", {
        whichchoice: 212,
        option: 1,
      });
    } else if (/Pop!/.test(adventureResponse)) {
      await this._client.visitUrl("choice.php", {
        whichchoice: 296,
        option: 1,
      });
    }

    this._amCaged = false;
    this._cageStatus = undefined;
  }

  async advLeft(message: PrivateMessage): Promise<boolean> {
    const beforeAdv = await this._client.getAdvs();
    if (beforeAdv > 11) {
      return true;
    }

    const currentFull = await this._client.getFull();
    const currentDrunk = await this._client.getDrunk();
    if (currentFull >= 15 && currentDrunk >= 14) {
      // have consumed as much as we can for the day and low on adventures
      return false;
    }

    const currentLevel = await this._client.getLevel();
    let itemConsumed = "";
    if (currentFull <= 9 && currentLevel >= 8) {
      //eat Fleetwood Mac 'n' Cheese since >= 6 fullness available and sufficient level
      itemConsumed = "Fleetwood mac 'n' cheese";
      console.log(`Attempting to eat ${itemConsumed}`);
      this._client.eat(7215);
    } else if (currentFull <= 12 && currentLevel >= 7) {
      //eat Crimbo pie since >= 3 fullness available and sufficient level
      itemConsumed = "Crimbo pie";
      console.log(`Attempting to eat ${itemConsumed}`);
      this._client.eat(2767);
    } else if (currentDrunk <= 8 && currentLevel >= 11) {
      //drink Psychotic Train wine since >= 6 drunk available and sufficient level
      itemConsumed = "Psychotic Train wine";
      console.log(`Attempting to drink ${itemConsumed}`);
      this._client.drink(7370);
    } else if (currentDrunk <= 12) {
      //drink middle of the road since >= 2 drunk available
      itemConsumed = "Middle of the Road™ brand whiskey";
      console.log(`Attempting to drink ${itemConsumed}`);
      this._client.drink(9948);
    }

    const afterAdv = await this._client.getAdvs();
    if (beforeAdv === afterAdv) {
      console.log(`I am out of ${itemConsumed}.`);
      this._client.sendPrivateMessage(
        message.who,
        `Please tell my operator that I am out of ${itemConsumed}.`
      );
    }

    return afterAdv > 11;
  }
}
