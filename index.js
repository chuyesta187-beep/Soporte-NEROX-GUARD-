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

// --- ⚙️ CONFIGURACIÓN GLOBAL ---
const LOGS_CHANNEL_ID = "TU_ID_DE_CANAL_DE_LOGS"; 
const STAFF_ROLE_ID = "TU_ID_DE_ROL_STAFF"; 
const TICKETS_CATEGORY_ID = "TU_ID_DE_CATEGORIA_TICKETS"; 

// 🗄️ PERSISTENCIA TOTAL CON SQLITE (Evita pérdidas por reinicios)
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
    console.log(`🚀 [PREMIUM 100%] Sistema definitivo iniciado correctamente.`);

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

    // 🎫 2. SISTEMA DE APERTURA DE TICKETS (Agrupación robusta corregida)
    const isTicketButton = interaction.isButton() && interaction.customId.startsWith('ticket_btn_');
    const isTicketMenu = interaction.isStringSelectMenu() && interaction.customId === 'ticket_menu_select';

    if (isTicketButton || isTicketMenu) {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;

        // Comprobación anti-duplicados absoluta usando la base de datos
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

        // Registrar nueva entrada persistente
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

    // 🔘 3. INTERACCIONES INTERNAS (LOCK, UNLOCK, CLAIM, TRANSCRIPT)
    if (interaction.isButton() && (
        interaction.customId.startsWith('lock_ticket_') || 
        interaction.customId.startsWith('unlock_ticket_') || 
        interaction.customId.startsWith('transcript_ticket_') ||
        interaction.customId.startsWith('claim_ticket_')
    )) {
        
        const channel = interaction.channel;
        const [action, , targetUserId] = interaction.customId.split('_'); 
        
        // Cargar datos de SQLite (Fallback si la DB fuese alterada manualmente)
        let ticketData = db.prepare('SELECT * FROM tickets WHERE channelId = ?').get(channel.id) || { userId: targetUserId, status: 'open', claimedBy: 'none' };

        // Deconstrucción segura de componentes UI para mitigar caídas en la edición
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
                if (member) await
