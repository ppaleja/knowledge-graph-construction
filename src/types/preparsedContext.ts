export interface PreparsedPaperContext {
    title: string;
    authors: Array<{ name: string; affiliation?: string; email?: string }>;
    abstract: string;
    keywords?: string[];
    mainFindings: string[];
    methodology?: {
        approach?: string;
        participants?: string;
        methods?: string[];
    };
    results?: Array<{
        finding?: string;
        significance?: string;
        supportingData?: string;
    }>;
    discussion?: {
        implications?: string[];
        limitations?: string[];
        futureWork?: string[];
    };
    references?: Array<{
        title: string;
        authors: string;
        year?: string;
        relevance?: string;
    }>;
    publication?: {
        journal?: string;
        year?: string;
        doi?: string;
        url?: string;
    };
}
