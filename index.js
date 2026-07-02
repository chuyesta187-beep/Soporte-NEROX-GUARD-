const express = require('express');
const app = express();

// 🌐 SERVIDOR EXPRESS PARA EVITAR EL CRASH POR TIMEOUT EN RENDER
app.get('/', (req, res) => {
    res.send('Bot activo NEROX GUARD 🚀');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`📡 Servidor web activo y escuchando en el puerto ${PORT}`);
});

// --- 📦 IMPORTACIONES DE DISCORD.JS Y SQLITE ---
const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    ChannelType,
    PermissionFlagsBits,
    AttachmentBuilder
} = require('discord.js');
const Database = require('better-sqlite3');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// --- ⚙️ CONFIGURACIÓN GLOBAL (IDs ACTUALIZADOS) ---
const LOGS_CHANNEL_ID = "1521367541254062130"; 
const STAFF_ROLE_ID = "1522126316722323497"; 
const TICKETS_CATEGORY_ID = "1522126548017217639"; 

// 🗄️ PERSISTENCIA TOTAL CON SQLITE
const db = new Database('tickets.db');

// Inicialización de la base de datos local
db.prepare(`
    CREATE TABLE IF NOT EXISTS tickets (
        channelId TEXT PRIMARY KEY,
        userId TEXT,
        status TEXT,
        claimedBy TEXT
    )
`).run();

client.once('ready', async () => {
    console.log('🚀 [PREMIUM 100%] Sistema definitivo iniciado correctamente.');

    // 🟣 STATUS NO MOLESTAR AUTOMÁTICO (NEROX STYLE)
    client.user.setPresence({
        status: 'dnd',
        activities: [{ name: '🛠️ Tickets | /createpanel', type: 0 }]
    });

    // Mapeo e inyección de comandos Slash globales
    const commands = [
        {
            name: 'embed',
            description: 'Crea un embed de información independiente',
            options: [
                { name: 'titulo', description: 'Título del embed', type: 3, required: true },
                { name: 'descripcion', description: 'Descripción del embed', type: 3, required: true },
                { name: 'color', description: 'Color en Hex (Ej: #FF0000)', type: 3, required: true },
                { name: 'canal', description: 'Canal donde se enviará', type: 7, required: true }
            ]
        },
        {
            name: 'createpanel',
            description: 'Crea el panel interactivo de tickets',
            options: [
                { name: 'titulo', description: 'Título del panel', type: 3, required: true },
                { name: 'descripcion', description: 'Descripción del panel', type: 3, required: true },
                { name: 'color', description: 'Color en Hex (Ej: #00FF00)', type: 3, required: true },
                { name: 'canal', description: 'Canal donde se enviará', type: 7, required: true },
                { name: 'opcion1', description: 'Primera opción (Obligatoria)', type: 3, required: true },
                { name: 'opcion2', description: 'Segunda opción (Opcional)', type: 3, required: false },
                { name: 'opcion3', description: 'Tercera opción (Opcional)', type: 3, required: false },
                { name: 'opcion4', description: 'Cuarta opción (Opcional)', type: 3, required: false }
            ]
        }
    ];

    await client.application.commands.set(commands);
    console.log('✔ Comandos Slash e infraestructura relacional sincronizados.');
});

client.on('interactionCreate', async (interaction) => {
    
    // 🧾 1. MANEJO DE COMANDOS SLASH
    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;

        if (commandName === 'embed') {
            await interaction.deferReply({ ephemeral: true });
            const titulo = options.getString('titulo');
            const descripcion = options.getString('descripcion').replace(/\\n/g, '\n');
            const color = options.getString('color');
            const canal = options.getChannel('canal');

            if (!canal.isTextBased()) return interaction.editReply('❌ Debe ser un canal de texto.');

            const embed = new EmbedBuilder()
                .setTitle(titulo)
                .setDescription(descripcion)
                .setColor(color.startsWith('#') ? color : `#${color}`)
                .setTimestamp();

            await canal.send({ embeds: [embed] });
            return interaction.editReply(`✅ Embed enviado con éxito a ${canal}.`);
        }

        if (commandName === 'createpanel') {
            await interaction.deferReply({ ephemeral: true });
            const titulo = options.getString('titulo');
            const descripcion = options.getString('descripcion').replace(/\\n/g, '\n');
            const color = options.getString('color');
            const canal = options.getChannel('canal');

            if (!canal.isTextBased()) return interaction.editReply('❌ Debe ser un canal de texto.');

            const opciones = [];
            for (let i = 1; i <= 4; i++) {
                const opc = options.getString(`opcion${i}`);
                if (opc) opciones.push(opc);
            }

            const panelEmbed = new EmbedBuilder()
                .setTitle(titulo)
                .setDescription(descripcion)
                .setColor(color.startsWith('#') ? color : `#${color}`)
                .setTimestamp();

            const row = new ActionRowBuilder();

            if (opciones.length <= 2) {
                opciones.forEach((opc, index) => {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`ticket_btn_${index}`)
                            .setLabel(opc)
                            .setStyle(ButtonStyle.Primary)
                    );
                });
            } else {
                const menu = new StringSelectMenuBuilder()
                    .setCustomId('ticket_menu_select')
                    .setPlaceholder('Selecciona una opción del panel...');

                opciones.forEach((opc, index) => {
                    menu.addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(opc)
                            .setValue(`ticket_opt_${index}`)
                    );
                });
                row.addComponents(menu);
            }

            await canal.send({ embeds: [panelEmbed], components: [row] });
            return interaction.editReply(`✅ Panel inyectado con éxito en ${canal}.`);
        }
    }

    // 🎫 2. SISTEMA DE APERTURA DE TICKETS
    const isTicketButton = (interaction.isButton() && interaction.customId.startsWith('ticket_btn_'));
    const isTicketMenu = (interaction.isStringSelectMenu() && interaction.customId === 'ticket_menu_select');

    if (isTicketButton || isTicketMenu) {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;

        const duplicateCheck = db.prepare('SELECT * FROM tickets WHERE userId = ? AND status != "closed"').get(interaction.user.id);
        if (duplicateCheck) {
            return interaction.editReply(`❌ Ya cuentas con un ticket activo en el servidor: <#${duplicateCheck.channelId}>`);
        }

        let parentId = null;
        if (TICKETS_CATEGORY_ID) {
            const catExists = guild.channels.cache.get(TICKETS_CATEGORY_ID);
            if (catExists && catExists.type === ChannelType.GuildCategory) parentId = TICKETS_CATEGORY_ID;
        }

        const ticketChannel = await guild.channels.create({
            name: `ticket-${interaction.user.id}`,
            type: ChannelType.GuildText,
            parent: parentId,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                { id: STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
            ],
        });

        db.prepare('INSERT INTO tickets (channelId, userId, status, claimedBy) VALUES (?, ?, ?, ?)').run(
            ticketChannel.id,
            interaction.user.id,
            'open',
            'none'
        );

        const ticketEmbed = new EmbedBuilder()
            .setTitle('🎟️ Ticket Abierto')
            .setDescription(`👤 **Usuario:** ${interaction.user}\n📌 **Estado:** Abierto\n👮 **Staff:** Disponible\n\nPor favor, describe tu consulta detalladamente.`)
            .setColor('#00AAFF')
            .setTimestamp();

        const ticketButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`lock_ticket_${interaction.user.id}`).setLabel('🔒 Cerrar Ticket').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`unlock_ticket_${interaction.user.id}`).setLabel('🔓 Abrir Ticket').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId(`transcript_ticket_${interaction.user.id}`).setLabel('🧾 Transcribir').setStyle(ButtonStyle.Secondary)
        );

        const claimButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`claim_ticket_${interaction.user.id}`).setLabel('🙋‍♂️ Tomar Ticket (Claim)').setStyle(ButtonStyle.Primary)
        );

        await ticketChannel.send({ 
            content: `${interaction.user} | <@&${STAFF_ROLE_ID}>`, 
            embeds: [ticketEmbed], 
            components: [ticketButtons, claimButton] 
        });

        return interaction.editReply(`✅ Canal creado con éxito: ${ticketChannel}`);
    }

    // 🔘 3. INTERACCIONES DENTRO DEL TICKET
    if (interaction.isButton() && (
        interaction.customId.startsWith('lock_ticket_') || 
        interaction.customId.startsWith('unlock_ticket_') || 
        interaction.customId.startsWith('transcript_ticket_') ||
        interaction.customId.startsWith('claim_ticket_')
    )) {
        
        const channel = interaction.channel;
        const [action, , targetUserId] = interaction.customId.split('_'); 
        
        let ticketData = db.prepare('SELECT * FROM tickets WHERE channelId = ?').get(channel.id) || { userId: targetUserId, status: 'open', claimedBy: 'none' };
        const [mainRow, claimRow] = interaction.message.components;

        // 🔒 Cerrar Ticket
        if (action === 'lock') {
            await interaction.deferReply();

            db.prepare('UPDATE tickets SET status = "closed" WHERE channelId = ?').run(channel.id);

            try {
                const member = await interaction.guild.members.fetch(targetUserId);
                if (member) await channel.permissionOverwrites.edit(member.id, { SendMessages: false });
            } catch (e) {}

            const newMainRow = ActionRowBuilder.from(mainRow);
            newMainRow.components[0].setDisabled(true); 
            newMainRow.components[1].setDisabled(false); 

            const lockedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor('#FF3333')
                .setDescription(`👤 **Usuario:** <@${targetUserId}>\n📌 **Estado:** 🔒 Cerrado\n👮 **Staff:** ${ticketData.claimedBy !== 'none' ? `<@${ticketData.claimedBy}>` : 'No asignado'}`);

            await interaction.message.edit({ embeds: [lockedEmbed], components: [newMainRow, claimRow] });
            
            const logsChannel = interaction.guild.channels.cache.get(LOGS_CHANNEL_ID);
            if (logsChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('📁 Ticket Cerrado')
                    .setDescription(`👤 **ID Usuario:** \`${targetUserId}\`\n👮 **Staff:** ${interaction.user}\n⏱️ **Fecha:** ${new Date().toLocaleDateString('es-ES')}`)
                    .setColor('#FF0000')
                    .setTimestamp();
                await logsChannel.send({ embeds: [logEmbed] });
            }

            return interaction.editReply(`🔒 Permisos de escritura removidos para el usuario.`);
        }

        // 🔓 Reabrir Ticket
        if (action === 'unlock') {
            await interaction.deferReply();

            db.prepare('UPDATE tickets SET status = "open" WHERE channelId = ?').run(channel.id);

            try {
                const member = await interaction.guild.members.fetch(targetUserId);
                if (member) await channel.permissionOverwrites.edit(member.id, { SendMessages: true });
            } catch (e) {}

            const newMainRow = ActionRowBuilder.from(mainRow);
            newMainRow.components[0].setDisabled(false); 
            newMainRow.components[1].setDisabled(true);  

            const openEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor('#00AAFF')
                .setDescription(`👤 **Usuario:** <@${targetUserId}>\n📌 **Estado:** Abierto\n👮 **Staff:** ${ticketData.claimedBy !== 'none' ? `<@${ticketData.claimedBy}>` : 'Disponible'}`);

            await interaction.message.edit({ embeds: [openEmbed], components: [newMainRow, claimRow] });
            return interaction.editReply(`🔓 El ticket ha sido reactivado.`);
        }

        // 🙋‍♂️ Claim System
        if (action === 'claim') {
            await interaction.deferReply();

            if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
                return interaction.editReply({ content: "❌ No posees el rol requerido para reclamar este caso." });
            }

            db.prepare('UPDATE tickets SET status = "claimed", claimedBy = ? WHERE channelId = ?').run(interaction.user.id, channel.id);

            const claimedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setDescription(`👤 **Usuario:** <@${targetUserId}>\n📌 **Estado:** Asignado\n👮 **Staff:** Atendido por ${interaction.user}`)
                .setColor('#FF9900');

            const newClaimRow = ActionRowBuilder.from(claimRow);
            newClaimRow.components[0].setDisabled(true).setLabel(`Asignado a ${interaction.user.username}`);

            await interaction.message.edit({ embeds: [claimedEmbed], components: [mainRow, newClaimRow] });
            return interaction.editReply(`🙋‍♂️ Te has asignado la resolución de este ticket.`);
        }

        // 🧾 Transcribir (Paginación limpia)
        if (action === 'transcript') {
            await interaction.deferReply();

            let allMessages = [];
            let lastId = null;
            const options = { limit: 100 };

            while (true) {
                if (lastId) options.before = lastId;
                const fetchedMessages = await channel.messages.fetch(options);
                if (fetchedMessages.size === 0) break;

                allMessages.push(...fetchedMessages.values());
                lastId = fetchedMessages.last().id;

                if (fetchedMessages.size < 100) break;
            }

            let transcriptText = `=== REGISTRO OFICIAL DE SEGURIDAD ===\nCanal: ${channel.name}\nUsuario ID: ${targetUserId}\nGenerado por: ${interaction.user.tag}\n\n`;

            allMessages.reverse().forEach(msg => {
                if (!msg.author.bot) {
                    transcriptText += `[${msg.createdAt.toLocaleTimeString('es-ES')}] ${msg.author.tag}: ${msg.content}\n`;
                }
            });

            const buffer = Buffer.from(transcriptText, 'utf-8');
            const attachment = new AttachmentBuilder(buffer, { name: `transcript-${channel.name}.txt` });

            const logsChannel = interaction.guild.channels.cache.get(LOGS_CHANNEL_ID);
            if (logsChannel) {
                await logsChannel.send({ 
                    content: `📄 **Transcripción asegurada** desde el ticket de \`<@${targetUserId}>\`.`, 
                    files: [attachment] 
                });
                return interaction.editReply(`✅ Transcripción procesada y enviada a la base de logs.`);
            } else {
                return interaction.editReply(`❌ Error de infraestructura: Canal de logs inalcanzable.`);
            }
        }
    } 
}); 

// 🔐 CONEXIÓN SEGURA MEDIANTE VARIABLES DE ENTORNO
client.login(process.env.TOKEN);
