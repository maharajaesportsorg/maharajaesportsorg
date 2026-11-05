import {
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits
} from 'discord.js';

const BUTTON = 'maharaja:';
const bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
});
let db;
let ready = false;
let sweepHandle;

async function settings(guildId) {
  const { data } = await db.from('discord_settings').select('*').eq('id', 1).maybeSingle();
  if (data?.guild_id && guildId && data.guild_id !== guildId) return null;
  return data;
}
const safeText = (v, max=1800) => String(v ?? '').slice(0,max);
function embed(title, description) {
  return new EmbedBuilder().setColor(0xE5B943).setTitle(safeText(title, 256)).setDescription(safeText(description, 4000)).setFooter({text:'MAHARAJA ESPORTS'}).setTimestamp();
}

async function finishGiveaway(g) {
  const { data: entries } = await db.from('discord_giveaway_entries').select('user_id').eq('giveaway_id', g.id);
  const ids = [...new Set((entries || []).map(x => x.user_id))];
  for (let i=ids.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [ids[i],ids[j]]=[ids[j],ids[i]]; }
  const winners = ids.slice(0, Math.min(Number(g.winners_count)||1, ids.length));
  await db.from('discord_giveaways').update({status:'ended', winner_ids:winners}).eq('id',g.id);
  const channel = await bot.channels.fetch(g.channel_id).catch(()=>null);
  if (channel?.isTextBased()) {
    const text = winners.length ? winners.map(id=>`<@${id}>`).join(', ') : 'No valid entries.';
    await channel.send({embeds:[embed(`Giveaway ended: ${g.prize}`, `Winner(s): ${text}\nCongratulations!`)]}).catch(()=>{});
  }
}
async function sweepGiveaways() {
  const { data } = await db.from('discord_giveaways').select('*').eq('status','active').lte('ends_at',new Date().toISOString()).limit(20);
  for (const g of data || []) await finishGiveaway(g);
}

bot.once('ready', async () => {
  ready = true;
  console.log(`Discord bot logged in as ${bot.user.tag}`);
  await sweepGiveaways().catch(console.error);
  sweepHandle = setInterval(()=>sweepGiveaways().catch(console.error), 15000);
});
bot.on('guildMemberAdd', async member => {
  try {
    const cfg = await settings(member.guild.id);
    if (!cfg?.welcome_enabled || !cfg.welcome_channel_id) return;
    const channel = await member.guild.channels.fetch(cfg.welcome_channel_id).catch(()=>null);
    if (!channel?.isTextBased()) return;
    const msg = (cfg.welcome_message || 'Welcome {user} to **{server}**! You are member #{memberCount}.')
      .replaceAll('{user}', `<@${member.id}>`).replaceAll('{server}', member.guild.name)
      .replaceAll('{memberCount}', String(member.guild.memberCount));
    await channel.send({content:msg.slice(0,1900), allowedMentions:{users:[member.id]}});
  } catch (e) { console.error('Welcome event:',e.message); }
});
bot.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const id = interaction.customId;
  try {
    if (id === `${BUTTON}ticket:create`) {
      const cfg = await settings(interaction.guildId);
      if (!cfg) return interaction.reply({content:'Ticket system is not configured for this server.',ephemeral:true});
      const existing = await db.from('discord_tickets').select('channel_id').eq('guild_id',interaction.guildId).eq('opener_id',interaction.user.id).eq('status','open').maybeSingle();
      if (existing.data) return interaction.reply({content:`You already have an open ticket: <#${existing.data.channel_id}>`,ephemeral:true});
      const channel = await interaction.guild.channels.create({
        name:`ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,90),
        type:ChannelType.GuildText,
        parent:cfg.ticket_category_id || undefined,
        permissionOverwrites:[
          {id:interaction.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
          {id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]},
          {id:bot.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ReadMessageHistory]},
          ...(cfg.ticket_support_role_id ? [{id:cfg.ticket_support_role_id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]}] : [])
        ]
      });
      await db.from('discord_tickets').insert({guild_id:interaction.guildId,channel_id:channel.id,opener_id:interaction.user.id,status:'open'});
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${BUTTON}ticket:close`).setLabel('Close Ticket').setStyle(ButtonStyle.Danger));
      await channel.send({content:`<@${interaction.user.id}> Welcome! Describe your issue and our team will assist you.`,components:[row],allowedMentions:{users:[interaction.user.id]}});
      if (cfg.ticket_log_channel_id) { const log=await interaction.guild.channels.fetch(cfg.ticket_log_channel_id).catch(()=>null); if(log?.isTextBased()) await log.send(`Ticket opened: ${channel} by ${interaction.user.tag}`).catch(()=>{}); }
      return interaction.reply({content:`Your ticket has been created: ${channel}`,ephemeral:true});
    }
    if (id === `${BUTTON}ticket:close`) {
      const {data:ticket}=await db.from('discord_tickets').select('*').eq('channel_id',interaction.channelId).eq('status','open').maybeSingle();
      if (!ticket) return interaction.reply({content:'This ticket is already closed.',ephemeral:true});
      const member=interaction.member;
      const cfg=await settings(interaction.guildId);
      const canClose = ticket.opener_id===interaction.user.id || (cfg?.ticket_support_role_id && member?.roles?.cache?.has(cfg.ticket_support_role_id)) || member?.permissions?.has?.(PermissionFlagsBits.ManageChannels) || member?.roles?.cache?.some(r=>r.permissions.has(PermissionFlagsBits.ManageChannels));
      if (!canClose) return interaction.reply({content:'Only the ticket creator or a moderator can close this ticket.',ephemeral:true});
      await db.from('discord_tickets').update({status:'closed',closed_at:new Date().toISOString()}).eq('channel_id',interaction.channelId);
      await interaction.reply({content:'Ticket closed. This channel will be deleted in 5 seconds.'});
      setTimeout(()=>interaction.channel?.delete('Ticket closed').catch(()=>{}),5000);
      return;
    }
    if (id.startsWith(`${BUTTON}giveaway:`)) {
      const giveawayId=id.slice(`${BUTTON}giveaway:`.length);
      const {data:g}=await db.from('discord_giveaways').select('*').eq('id',giveawayId).eq('status','active').maybeSingle();
      if (!g || new Date(g.ends_at)<=new Date()) return interaction.reply({content:'This giveaway has ended.',ephemeral:true});
      const {error}=await db.from('discord_giveaway_entries').insert({giveaway_id:giveawayId,user_id:interaction.user.id});
      if (error?.code==='23505') return interaction.reply({content:'You are already entered!',ephemeral:true});
      if (error) throw error;
      return interaction.reply({content:'You have entered the giveaway. Good luck!',ephemeral:true});
    }
    if (id.startsWith(`${BUTTON}role:`)) {
      const roleId=id.slice(`${BUTTON}role:`.length);
      const {data:rr}=await db.from('discord_reaction_roles').select('*').eq('guild_id',interaction.guildId).eq('message_id',interaction.message.id).eq('role_id',roleId).maybeSingle();
      if (!rr) return interaction.reply({content:'This role button is no longer configured.',ephemeral:true});
      const role=await interaction.guild.roles.fetch(roleId).catch(()=>null);
      if (!role || !interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles) || role.position>=interaction.guild.members.me.roles.highest.position)
        return interaction.reply({content:'I cannot manage this role. Check my Manage Roles permission and role position.',ephemeral:true});
      const member=await interaction.guild.members.fetch(interaction.user.id);
      if(member.roles.cache.has(roleId)){await member.roles.remove(roleId);return interaction.reply({content:`Removed ${role.name}.`,ephemeral:true});}
      await member.roles.add(roleId); return interaction.reply({content:`Added ${role.name}.`,ephemeral:true});
    }
  } catch (e) {
    console.error('Discord interaction:',e);
    if (!interaction.replied && !interaction.deferred) await interaction.reply({content:'Something went wrong. Please contact a server administrator.',ephemeral:true}).catch(()=>{});
  }
});
export function startDiscordBot(database) {
  db=database;
  if (!process.env.DISCORD_BOT_TOKEN) { console.log('Discord bot disabled: DISCORD_BOT_TOKEN is not configured.'); return; }
  bot.login(process.env.DISCORD_BOT_TOKEN).catch(e=>{ready=false;console.error('Discord login failed:',e.message);});
}
export function discordStatus() {
  return {configured:Boolean(process.env.DISCORD_BOT_TOKEN),ready,tag:bot.user?.tag||null,guilds:bot.guilds.cache.map(g=>({id:g.id,name:g.name}))};
}
export async function sendAnnouncement({guildId,channelId,title,message}) {
  const channel=await bot.channels.fetch(channelId).catch(()=>null);
  if(!channel?.isTextBased() || channel.guildId!==guildId) throw new Error('Select a text channel in your configured Discord server.');
  await channel.send({embeds:[embed(title,message)]});
}
export async function createGiveaway({guildId,channelId,prize,winnersCount,durationMinutes,createdBy}) {
  const channel=await bot.channels.fetch(channelId).catch(()=>null);
  if(!channel?.isTextBased() || channel.guildId!==guildId) throw new Error('Select a text channel in your configured server.');
  const endsAt=new Date(Date.now()+durationMinutes*60000).toISOString();
  const {data:g,error}=await db.from('discord_giveaways').insert({guild_id:guildId,channel_id:channelId,prize,winners_count:winnersCount,ends_at:endsAt,status:'active',created_by:createdBy}).select().single();
  if(error) throw error;
  const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${BUTTON}giveaway:${g.id}`).setLabel('Enter Giveaway').setStyle(ButtonStyle.Success));
  try {
    const msg=await channel.send({embeds:[embed(`🎉 GIVEAWAY: ${prize}`,`Winners: **${winnersCount}**\nEnds: <t:${Math.floor(new Date(endsAt).getTime()/1000)}:R>\nClick below to enter!`)],components:[row]});
    await db.from('discord_giveaways').update({message_id:msg.id}).eq('id',g.id);
  } catch(e) { await db.from('discord_giveaways').update({status:'cancelled'}).eq('id',g.id); throw e; }
  return {giveaway:{...g,ends_at:endsAt}};
}
export async function createTicketPanel({guildId,channelId,title,description}) {
  const channel=await bot.channels.fetch(channelId).catch(()=>null);
  if(!channel?.isTextBased() || channel.guildId!==guildId) throw new Error('Select a text channel in your configured Discord server.');
  const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${BUTTON}ticket:create`).setLabel('Open a Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'));
  const msg=await channel.send({embeds:[embed(title,description)],components:[row]});
  return {messageId:msg.id,channelId};
}
export async function createReactionRole({guildId,channelId,roleId,label,emoji}) {
  const guild=bot.guilds.cache.get(guildId);
  if(!guild) throw new Error('Configured Discord server is not connected to the bot.');
  const role=await guild.roles.fetch(roleId).catch(()=>null);
  if(!role) throw new Error('Role not found in the configured server.');
  const channel=await guild.channels.fetch(channelId).catch(()=>null);
  if(!channel?.isTextBased()) throw new Error('Role panel channel not found.');
  const {data:rr,error}=await db.from('discord_reaction_roles').insert({guild_id:guildId,channel_id:channelId,role_id:roleId,label,emoji:emoji||null}).select().single();
  if(error) throw error;
  const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${BUTTON}role:${roleId}`).setLabel(label).setStyle(ButtonStyle.Secondary).setEmoji(emoji||'🎮'));
  try { const msg=await channel.send({embeds:[embed('Choose Your Roles','Click a button to add or remove the corresponding role.')],components:[row]}); await db.from('discord_reaction_roles').update({message_id:msg.id}).eq('id',rr.id); }
  catch(e){await db.from('discord_reaction_roles').delete().eq('id',rr.id);throw e;}
  return {ok:true};
}
