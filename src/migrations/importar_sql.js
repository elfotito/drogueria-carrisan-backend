// importar_directo.js
import fs from 'fs';
import pg from 'pg';

const { Client } = pg;

// ============================================================
// CONFIGURACIÓN - REEMPLAZA CON TUS DATOS
// ============================================================
const DB_CONFIG = {
    host: 'aws-1-us-west-2.pooler.supabase.com',  // ← Tu host de Supabase
    port: 5432,
    database: 'postgres',
    user: 'postgres.fqeshthtycmzgyibiurq',
    password: 'carrisan1410',           // ← Tu contraseña
    ssl: { rejectUnauthorized: false }
};

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

function leerCSV(archivo) {
    console.log(`   📂 Leyendo ${archivo}...`);
    const contenido = fs.readFileSync(archivo, 'utf-8');
    const lineas = contenido.split('\n').filter(l => l.trim());
    
    if (lineas.length === 0) return [];
    
    const headers = lineas[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const filas = [];
    
    for (let i = 1; i < lineas.length; i++) {
        let linea = lineas[i];
        const valores = [];
        let valorActual = '';
        let dentroComillas = false;
        
        for (let j = 0; j < linea.length; j++) {
            const char = linea[j];
            if (char === '"') {
                dentroComillas = !dentroComillas;
            } else if (char === ',' && !dentroComillas) {
                valores.push(valorActual.trim());
                valorActual = '';
            } else {
                valorActual += char;
            }
        }
        valores.push(valorActual.trim());
        
        const obj = {};
        headers.forEach((h, idx) => {
            const val = valores[idx] ? valores[idx].replace(/^"|"$/g, '') : '';
            obj[h] = val;
        });
        filas.push(obj);
    }
    return filas;
}

function normalizarNombre(nombre) {
    if (!nombre) return '';
    let s = nombre.toLowerCase().trim();
    const acentos = {
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
        'ü': 'u', 'ñ': 'n', 'Á': 'a', 'É': 'e', 'Í': 'i',
        'Ó': 'o', 'Ú': 'u', 'Ü': 'u', 'Ñ': 'n'
    };
    s = s.replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, match => acentos[match] || match);
    s = s.replace(/[^a-z0-9\s]/g, '');
    s = s.replace(/\s+/g, ' ');
    return s.trim();
}

// ============================================================
// FUNCIÓN PRINCIPAL
// ============================================================

async function importar() {
    const client = new Client(DB_CONFIG);
    
    try {
        console.log('🔌 Conectando a Supabase...');
        await client.connect();
        console.log('✅ Conectado\n');
        
        // 1. Leer archivos CSV
        console.log('📂 Leyendo archivos CSV...');
        const atcData = leerCSV('atc_clasificaciones_import.csv');
        const moleculasData = leerCSV('moleculas_referencias_import.csv');
        
        console.log(`   📊 ATC: ${atcData.length} registros`);
        console.log(`   📊 Moléculas: ${moleculasData.length} registros`);
        
        if (atcData.length === 0) {
            console.error('❌ Error: No se encontraron datos en atc_clasificaciones_import.csv');
            return;
        }
        
        // 2. Insertar ATC directamente (sin tablas temporales)
        console.log('\n📥 Insertando ATC en tabla definitiva...');
        let atcInsertados = 0;
        let atcActualizados = 0;
        
        for (const row of atcData) {
            const codigo = row.codigo || '';
            const nombre = row.nombre || '';
            const nivel = parseInt(row.nivel) || 0;
            const esSistema = row.es_sistema === 'true' || row.es_sistema === 't' || row.es_sistema === '1';
            
            if (!codigo) continue;
            
            try {
                // Usar ON CONFLICT para insertar o actualizar
                const result = await client.query(`
                    INSERT INTO atc_clasificaciones (codigo, nombre, nivel, es_sistema)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (codigo) DO UPDATE SET
                        nombre = EXCLUDED.nombre,
                        nivel = EXCLUDED.nivel,
                        es_sistema = EXCLUDED.es_sistema
                    RETURNING codigo
                `, [codigo, nombre, nivel, esSistema]);
                
                if (result.rowCount > 0) {
                    atcInsertados++;
                }
            } catch (err) {
                console.warn(`      ⚠️ Error con ${codigo}: ${err.message}`);
            }
        }
        console.log(`   ✅ ${atcInsertados} códigos ATC procesados`);
        
        // 3. Resolver relaciones padre-hijo
        console.log('\n🔗 Resolviendo relaciones padre-hijo...');
        const niveles = [
            { child: 2, parent: 1, length: 1, label: 'Nivel 2' },
            { child: 3, parent: 2, length: 3, label: 'Nivel 3' },
            { child: 4, parent: 3, length: 4, label: 'Nivel 4' },
            { child: 5, parent: 4, length: 5, label: 'Nivel 5' }
        ];
        
        for (const { child, parent, length, label } of niveles) {
            try {
                const result = await client.query(`
                    UPDATE atc_clasificaciones child 
                    SET padre_id = parent.id
                    FROM atc_clasificaciones parent
                    WHERE child.nivel = $1 
                      AND parent.nivel = $2
                      AND parent.codigo = LEFT(child.codigo, $3)
                      AND child.padre_id IS NULL
                    RETURNING child.codigo
                `, [child, parent, length]);
                
                if (result.rowCount > 0) {
                    console.log(`   ✅ ${label}: ${result.rowCount} relaciones resueltas`);
                } else {
                    console.log(`   ℹ️  ${label}: sin relaciones pendientes`);
                }
            } catch (err) {
                console.log(`   ⚠️  ${label}: ${err.message}`);
            }
        }
        
        // 4. Crear índice de ATC por nombre (para cruce)
        console.log('\n🔍 Creando índice de ATC por nombre...');
        const { rows: atcList } = await client.query(`
            SELECT id, codigo, nombre 
            FROM atc_clasificaciones 
            WHERE nivel = 5
        `);
        
        const atcIndex = new Map();
        for (const atc of atcList) {
            const nombreNorm = normalizarNombre(atc.nombre);
            if (!atcIndex.has(nombreNorm)) {
                atcIndex.set(nombreNorm, []);
            }
            atcIndex.get(nombreNorm).push({
                id: atc.id,
                codigo: atc.codigo,
                nombre: atc.nombre
            });
        }
        console.log(`   ✅ Índice creado con ${atcIndex.size} nombres únicos`);
        
        // 5. Insertar moléculas con cruce ATC
        console.log('\n📥 Insertando moléculas con cruce ATC...');
        let conAtc = 0;
        let sinAtc = 0;
        let insertados = 0;
        let actualizados = 0;
        
        for (const row of moleculasData) {
            const nombre = row.nombre || '';
            if (!nombre) continue;
            
            const nombreEn = row.nombre_generico_en || '';
            const sinonimos = row.sinonimos || '{}';
            const descripcion = row.descripcion || '';
            
            // Buscar ATC por nombre
            const nombreNorm = normalizarNombre(nombre);
            let atcId = null;
            let atcCodigo = null;
            
            // Intento 1: Coincidencia exacta
            if (atcIndex.has(nombreNorm)) {
                const matches = atcIndex.get(nombreNorm);
                atcId = matches[0].id;
                atcCodigo = matches[0].codigo;
                conAtc++;
            } else {
                // Intento 2: Coincidencia parcial
                let encontrado = false;
                for (const [key, matches] of atcIndex) {
                    if (nombreNorm.includes(key) || key.includes(nombreNorm)) {
                        atcId = matches[0].id;
                        atcCodigo = matches[0].codigo;
                        conAtc++;
                        encontrado = true;
                        break;
                    }
                }
                if (!encontrado) {
                    sinAtc++;
                }
            }
            
            try {
                const result = await client.query(`
                    INSERT INTO moleculas_referencias 
                        (atc_id, nombre, nombre_generico_en, sinonimos, descripcion)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (nombre) DO UPDATE SET
                        atc_id = EXCLUDED.atc_id,
                        nombre_generico_en = EXCLUDED.nombre_generico_en,
                        sinonimos = EXCLUDED.sinonimos,
                        descripcion = EXCLUDED.descripcion
                    RETURNING nombre
                `, [
                    atcId,
                    nombre,
                    nombreEn || null,
                    sinonimos,
                    descripcion || null
                ]);
                
                if (result.rowCount > 0) {
                    insertados++;
                }
            } catch (err) {
                console.warn(`   ⚠️ Error con ${nombre}: ${err.message}`);
            }
        }
        
        console.log(`   ✅ ${insertados} moléculas procesadas`);
        console.log(`   ✅ Con ATC: ${conAtc}`);
        console.log(`   ❌ Sin ATC: ${sinAtc}`);
        
        // 6. Estadísticas finales
        console.log('\n📊 ESTADÍSTICAS FINALES:');
        const { rows: stats } = await client.query(`
            SELECT 
                (SELECT COUNT(*) FROM atc_clasificaciones) AS total_atc,
                (SELECT COUNT(*) FROM moleculas_referencias) AS total_moleculas,
                (SELECT COUNT(*) FROM moleculas_referencias WHERE atc_id IS NOT NULL) AS con_atc,
                (SELECT COUNT(*) FROM moleculas_referencias WHERE atc_id IS NULL) AS sin_atc
        `);
        
        console.log(`   ✅ ATC total: ${stats[0].total_atc}`);
        console.log(`   ✅ Moléculas total: ${stats[0].total_moleculas}`);
        console.log(`   ✅ Moléculas con ATC: ${stats[0].con_atc}`);
        console.log(`   ❌ Moléculas sin ATC: ${stats[0].sin_atc}`);
        
        // 7. Mostrar ejemplos de moléculas sin ATC
        if (parseInt(stats[0].sin_atc) > 0) {
            console.log('\n📌 Ejemplos de moléculas sin ATC:');
            const { rows: sinAtcList } = await client.query(`
                SELECT nombre 
                FROM moleculas_referencias 
                WHERE atc_id IS NULL 
                LIMIT 10
            `);
            for (const row of sinAtcList) {
                console.log(`   - ${row.nombre}`);
            }
            if (parseInt(stats[0].sin_atc) > 10) {
                console.log(`   ... y ${parseInt(stats[0].sin_atc) - 10} más`);
            }
        }
        
        console.log('\n✅ ¡Importación completada con éxito!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
        console.log('\n🔌 Conexión cerrada');
    }
}

// ============================================================
// EJECUTAR
// ============================================================

importar();