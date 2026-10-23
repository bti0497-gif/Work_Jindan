import { supabase } from './supabaseClient';

const TABLE_MAP = {
    '회원관리': 'jindan_users',
    '프로젝트관리': 'jindan_projects',
    '공정관리': 'jindan_processes',
    '할일관리': 'jindan_tasks',
    '전체게시판': 'jindan_posts',
    '게시판댓글': 'jindan_comments',
    '파일관리': 'jindan_files'
};

export const supabaseService = {
    /**
     * 데이터를 Supabase에 저장 (Upsert)
     */
    upsertData: async (tableName, data) => {
        const sbTable = TABLE_MAP[tableName];
        if (!sbTable) {
            console.error(`Table mapping not found for: ${tableName}`);
            return null;
        }

        try {
            // Supabase에 데이터를 업서트합니다.
            // onConflict 옵션을 사용하여 ID가 겹치면 업데이트, 없으면 삽입합니다.
            const idKey = (tableName === '회원관리') ? 'person_id' : 'id';
            
            // 데이터 배열인 경우와 단건인 경우 모두 처리
            const dataToUpsert = Array.isArray(data) ? data : [data];
            
            const { data: result, error } = await supabase
                .from(sbTable)
                .upsert(dataToUpsert, { onConflict: idKey });

            if (error) throw error;
            console.log(`Supabase synced (${tableName}):`, dataToUpsert.length, 'records');
            return result;
        } catch (error) {
            console.warn(`Supabase upsert warning (${tableName}). Might be offline:`, error.message);
            throw error;
        }
    },

    /**
     * 데이터를 Supabase에서 삭제
     */
    deleteData: async (tableName, id) => {
        const sbTable = TABLE_MAP[tableName];
        if (!sbTable) return;

        try {
            const idKey = tableName === '회원관리' ? 'person_id' : 'id';
            const { error } = await supabase
                .from(sbTable)
                .delete()
                .eq(idKey, id);

            if (error) throw error;
        } catch (error) {
            console.error(`Supabase delete error (${tableName}):`, error);
            throw error;
        }
    },

    /**
     * 특정 테이블의 최신 데이터를 가져옴
     */
    fetchData: async (tableName) => {
        const sbTable = TABLE_MAP[tableName];
        if (!sbTable) return [];

        try {
            const { data, error } = await supabase
                .from(sbTable)
                .select('*')
                .order('createdAt', { ascending: false });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error(`Supabase fetch error (${tableName}):`, error);
            throw error;
        }
    }
};
