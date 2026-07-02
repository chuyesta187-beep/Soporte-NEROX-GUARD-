const express = require('express');
const app = express();

// 🌐 ENDPOINT DE MONITOREO (Ideal para enlazar con UptimeRobot)
app.get('/', (req, res) => {
    res.send('NEXUS TICKET PROTOCOL ACTIVE 🚀');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`📡 Servidor de monitoreo web activo en puerto ${PORT}`);
});

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
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel]
});

// --- ⚙️ CONFIGURACIÓN GLOBAL ---
const LOGS_CHANNEL_ID = "1521367541254062130"; 
const STAFF_ROLE_ID = "1522126316722323497"; 
const TICKETS_CATEGORY_ID = "1522126548017217639"; 

// ⏳ COOLDOWN MAP CON LIMPIEZA AUTOMÁTICA
const cooldowns = new Map();

const db = new Database('tickets.db');
db.prepare(`
    CREATE TABLE IF NOT EXISTS tickets (
        channelId TEXT PRIMARY KEY,
        userId TEXT,
        status TEXT,
        claimedBy TEXT
    )
`).run();

client.once('ready', async () => {
    console.log('📡 Bot conectado a Discord.');
    client.user.setPresence({ status: 'dnd', activities: [{ name: '🛠️ Soporte | /createpanel', type: 0 }] });

    // 🧼 SINCRO AVANZADA EN ARRANQUE (Sin depender de la caché)
    console.log('🧹 Sincronizando registros con la API de Discord...');
    try {
        const activeTickets = db.prepare('SELECT channelId FROM tickets').all();
        let cleanedCount = 0;

        for (const ticket of activeTickets) {
            // Buscamos directo en la API si no está en la caché local
            const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
            if (!channel) {
                db.prepare('DELETE FROM tickets WHERE channelId = ?').run(ticket.channelId);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) console.log(`🗑️ Se purgaron ${cleanedCount} tickets obsoletos de la DB.`);
    } catch (err) {
        console.error('❌ Error en sincronización inicial:', err);
    }

    const commands = [
        {
            name: 'embed',
            description: 'Crea un embed de información independiente',
            options: [
                { name: 'titulo', description: 'Título del embed', type: 3, required: true },
                { name: 'descripcion', description: 'Descripción del embed', type: 3, required: true },
                { name: 'color', description: 'Color en Hex', type: 3, required: true },
                { name: 'canal', description: 'Canal de destino', type: 7, required: true }
            ]
        },
        {
            name: 'createpanel',
            description: 'Crea el panel interactivo de tickets',
            options: [
                { name: 'titulo', description: 'Título del panel', type: 3, required: true },
                { name: 'descripcion', description: 'Descripción del panel', type: 3, required: true },
                { name: 'color', description: 'Color en Hex', type: 3, required: true },
                { name: 'canal', description: 'Canal de destino', type: 7, required: true },
                { name: 'opcion1', description: 'Opción 1 (Obligatoria)', type: 3, required: true },
                { name: 'opcion2', description: 'Opción 2 (Opcional)', type: 3, required: false },
                { name: 'opcion3', description: 'Opción 3 (Opcional)', type: 3, required: false },
                { name: 'opcion4', description: 'Opción 4 (Opcional)', type: 3, required: false }
            ]
        }
    ];

    try {
        if (client.application) {
            await client.application.commands.set(commands);
            console.log('✔ Comandos globales desplegados.');
        }
    } catch (err) {
        console.error('❌ Error registrando comandos Slash:', err);
    }
});

client.on('interactionCreate', async (interaction) => {
    
    // 🧾 CONTROLADOR DE COMANDOS SLASH
    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;

        if (commandName === 'embed') {
            if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
            const titulo = options.getString('titulo');
            const descripcion = options.getString('descripcion').replace(/\\n/g, '\n');
            const color = options.getString('color');
            const canal = options.getChannel('canal');

            if (!canal.isTextBased()) return interaction.editReply('❌ Debe ser un canal de texto.');

            const embed = new EmbedBuilder()
                .setTitle(titulo)
                .setDescription(descripcion)
                .setColor(color.startsWith('#') ? color : `#${color}`);

            await canal.send({ embeds: [embed] });
            return interaction.editReply(`✅ Embed enviado a ${canal}.`);
        }

        if (commandName === 'createpanel') {
            if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
            const titulo = options.getString('titulo');
            const descripcion = options.getString('descripcion').replace(/\\n/g, '\n');
            const color = options.getString('color');
            const canal = options.getChannel('canal');

            if (!canal.isTextBased()) return interaction.editReply('❌ Debe ser un canal de texto.');

            const opciones = [
                options.getString('opcion1'), 
                options.getString('opcion2'),
                options.getString('opcion3'),
                options.getString('opcion4')
            ].filter(Boolean);

            const panelEmbed = new EmbedBuilder()
                .setTitle(titulo)
                .setDescription(descripcion)
                .setColor(color.startsWith('#') ? color : `#${color}`);

            const row = new ActionRowBuilder();
            
            if (opciones.length <= 2) {
                opciones.forEach((opc, index) => {
                    row.addComponents(new ButtonBuilder().setCustomId(`ticket_btn_${index}`).setLabel(opc).setStyle(ButtonStyle.Primary));
                });
            } else {
                const menu = new StringSelectMenuBuilder()
                    .setCustomId('ticket_menu_select')
                    .setPlaceholder('Selecciona una categoría de asistencia...');

                opciones.forEach((opc, index) => {
                    menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(opc).setValue(`ticket_opt_${index}`));
                });
                row.addComponents(menu);
            }

            await canal.send({ embeds: [panelEmbed], components: [row] });
            return interaction.editReply(`✅ Panel inyectado correctamente en ${canal}.`);
        }
    }

    // 🎫 ENRUTADOR DE APERTURAS (BOTONES + SELECT MENU)
    const isTicketButton = (interaction.isButton() && interaction.customId.startsWith('ticket_btn_'));
    const isTicketMenu = (interaction.isStringSelectMenu() && interaction.customId === 'ticket_menu_select');

    if (isTicketButton || isTicketMenu) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;
        const actionId = isTicketButton ? interaction.customId : interaction.values[0];
        const cooldownKey = `${userId}-${actionId}`;
        
        if (cooldowns.has(cooldownKey)) {
            return interaction.editReply("⚠️ Acción bloqueada por protección anti-spam. Espera un momento.");
        }
        
        cooldowns.set(cooldownKey, true);
        setTimeout(() => cooldowns.delete(cooldownKey), 5000); 

        const guild = interaction.guild;

        // VERIFICACIÓN CON FETCH DE SEGURIDAD CONTRA CACHÉ VOLÁTIL
        const duplicateCheck = db.prepare('SELECT * FROM tickets WHERE userId = ? AND status != "closed"').get(userId);
        if (duplicateCheck) {
            const realChannel = await client.channels.fetch(duplicateCheck.channelId).catch(() => null);
            if (realChannel) {
                return interaction.editReply(`❌ Ya tienes una sesión de soporte activa en: <#${duplicateCheck.channelId}>`);
            } else {
                db.prepare('DELETE FROM tickets WHERE channelId = ?').run(duplicateCheck.channelId);
            }
        }

        let parentId = null;
        if (TICKETS_CATEGORY_ID) {
            const catExists = await client.channels.fetch(TICKETS_CATEGORY_ID).catch(() => null);
            if (catExists && catExists.type === ChannelType.GuildCategory) parentId = TICKETS_CATEGORY_ID;
        }

        let ticketChannel;
        try {
            const createPromise = guild.channels.create({
                name: `ticket-${interaction.user.id}`,
                type: ChannelType.GuildText,
                parent: parentId || null,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
                ],
            });

            ticketChannel = await Promise.race([
                createPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout API")), 8000))
            ]);
        } catch (err) {
            console.error("❌ Excepción en la API al crear canal:", err.message);
            return interaction.editReply("❌ Discord demoró en responder o el bot carece de permisos de administrador.");
        }

        try {
            db.prepare('INSERT INTO tickets (channelId, userId, status, claimedBy) VALUES (?, ?, ?, ?)').run(ticketChannel.id, userId, 'open', 'none');
        } catch (sqliteErr) {
            return interaction.editReply("❌ Conflicto al registrar el ticket en el índice primario.");
        }

        const ticketEmbed = new EmbedBuilder()
            .setTitle('🎟️ Módulo de Soporte Activo')
            .setDescription(`👤 **Cliente:** ${interaction.user}\n📌 **Estado:** Abierto\n👮 **Agente:** Esperando asignación...`)
            .setColor('#00AAFF');

        const ticketButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`lock_ticket_${userId}`).setLabel('🔒 Cerrar Ticket').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`unlock_ticket_${userId}`).setLabel('🔓 Reabrir Ticket').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId(`transcript_ticket_${userId}`).setLabel('🧾 Transcribir').setStyle(ButtonStyle.Secondary)
        );

        const claimButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`claim_ticket_${userId}`).setLabel('🙋‍♂️ Reclamar Caso').setStyle(ButtonStyle.Primary)
        );

        await ticketChannel.send({ content: `${interaction.user} | <@&${STAFF_ROLE_ID}>`, embeds: [ticketEmbed], components: [ticketButtons, claimButton] });
        return interaction.editReply({ content: `✅ Sala de soporte desplegada correctamente: ${ticketChannel}` });
    }

    // 🔘 CONTROLADOR DE ACCIONES OPERATIVAS (SEGURIDAD Y PARSEO SAAS TIER)
    if (interaction.isButton() && (
        interaction.customId.startsWith('lock_ticket_') || 
        interaction.customId.startsWith('unlock_ticket_') || 
        interaction.customId.startsWith('transcript_ticket_') ||
        interaction.customId.startsWith('claim_ticket_') ||
        interaction.customId.startsWith('delete_ticket_')
    )) {
        const channel = interaction.channel;
        
        const prefixes = ['lock_ticket_', 'unlock_ticket_', 'transcript_ticket_', 'claim_ticket_', 'delete_ticket_'];
        let action = '';
        let targetUserId = '';

        for (const prefix of prefixes) {
            if (interaction.customId.startsWith(prefix)) {
                action = prefix.split('_')[0];
                targetUserId = interaction.customId.replace(prefix, '');
                break;
            }
        }

        const isStaff = interaction.member.roles.cache.has(STAFF_ROLE_ID);
        const isOwner = interaction.user.id === targetUserId;

        // 🚨 5. CONTROL DE SEGURIDAD EXTREMO (RBAC)
        if (!isOwner && !isStaff) {
            if (!interaction.deferred && !interaction.replied) await interaction.reply({ content: "❌ No tienes autorización sobre este caso.", ephemeral: true });
            return;
        }

        let ticketData = db.prepare('SELECT * FROM tickets WHERE channelId = ?').get(channel.id) || { userId: targetUserId, status: 'open', claimedBy: 'none' };
        
        // DESTRUCCIÓN CON AUDITORÍA COMPLETA (PAGINADA)
        if (action === 'delete') {
            if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
            if (!isStaff) return interaction.editReply({ content: "❌ Permisos insuficientes para eliminar el canal." });

            const logsChannel = await client.channels.fetch(LOGS_CHANNEL_ID).catch(() => null);
            
            // 🚨 4. PAGINACIÓN REAL DE HISTORIAL COMPLETO (Hasta 500 mensajes)
            try {
                let allMessages = [];
                let lastId = null;
                while (allMessages.length < 500) {
                    const fetchOptions = { limit: 100 };
                    if (lastId) fetchOptions.before = lastId;

                    const messages = await channel.messages.fetch(fetchOptions);
                    if (messages.size === 0) break;

                    allMessages.push(...messages.values());
