from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import sqlite3
import uuid
from datetime import datetime
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend communication

# Database setup
DATABASE = 'flowcharts.db'

def init_db():
    """Initialize the database with required tables"""
    conn = sqlite3.connect(DATABASE)
    c = conn.cursor()
    
    # Create flowcharts table
    c.execute('''
        CREATE TABLE IF NOT EXISTS flowcharts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create templates table for reusable flowchart templates
    c.execute('''
        CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            data TEXT NOT NULL,
            category TEXT DEFAULT 'general',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()

def get_db_connection():
    """Get database connection with row factory"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})

@app.route('/api/flowcharts', methods=['GET'])
def get_flowcharts():
    """Get all flowcharts with pagination"""
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        offset = (page - 1) * limit
        
        conn = get_db_connection()
        
        # Get total count
        total = conn.execute('SELECT COUNT(*) FROM flowcharts').fetchone()[0]
        
        # Get flowcharts with pagination
        flowcharts = conn.execute('''
            SELECT id, name, description, created_at, updated_at 
            FROM flowcharts 
            ORDER BY updated_at DESC 
            LIMIT ? OFFSET ?
        ''', (limit, offset)).fetchall()
        
        conn.close()
        
        return jsonify({
            'flowcharts': [dict(row) for row in flowcharts],
            'total': total,
            'page': page,
            'limit': limit,
            'total_pages': (total + limit - 1) // limit
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/flowcharts/<flowchart_id>', methods=['GET'])
def get_flowchart(flowchart_id):
    """Get a specific flowchart by ID"""
    try:
        conn = get_db_connection()
        flowchart = conn.execute('''
            SELECT * FROM flowcharts WHERE id = ?
        ''', (flowchart_id,)).fetchone()
        conn.close()
        
        if flowchart:
            result = dict(flowchart)
            result['data'] = json.loads(result['data'])
            return jsonify(result)
        else:
            return jsonify({'error': 'Flowchart not found'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/flowcharts', methods=['POST'])
def create_flowchart():
    """Create a new flowchart"""
    try:
        data = request.json
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({'error': 'Name is required'}), 400
        
        if not data.get('data'):
            return jsonify({'error': 'Flowchart data is required'}), 400
        
        flowchart_id = str(uuid.uuid4())
        flowchart_data = json.dumps(data['data'])
        
        conn = get_db_connection()
        conn.execute('''
            INSERT INTO flowcharts (id, name, description, data)
            VALUES (?, ?, ?, ?)
        ''', (flowchart_id, data['name'], data.get('description', ''), flowchart_data))
        conn.commit()
        conn.close()
        
        return jsonify({
            'id': flowchart_id,
            'message': 'Flowchart created successfully'
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/flowcharts/<flowchart_id>', methods=['PUT'])
def update_flowchart(flowchart_id):
    """Update an existing flowchart"""
    try:
        data = request.json
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({'error': 'Name is required'}), 400
        
        if not data.get('data'):
            return jsonify({'error': 'Flowchart data is required'}), 400
        
        flowchart_data = json.dumps(data['data'])
        
        conn = get_db_connection()
        
        # Check if flowchart exists
        existing = conn.execute('SELECT id FROM flowcharts WHERE id = ?', (flowchart_id,)).fetchone()
        if not existing:
            conn.close()
            return jsonify({'error': 'Flowchart not found'}), 404
        
        # Update flowchart
        conn.execute('''
            UPDATE flowcharts 
            SET name = ?, description = ?, data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (data['name'], data.get('description', ''), flowchart_data, flowchart_id))
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'Flowchart updated successfully'})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/flowcharts/<flowchart_id>', methods=['DELETE'])
def delete_flowchart(flowchart_id):
    """Delete a flowchart"""
    try:
        conn = get_db_connection()
        
        # Check if flowchart exists
        existing = conn.execute('SELECT id FROM flowcharts WHERE id = ?', (flowchart_id,)).fetchone()
        if not existing:
            conn.close()
            return jsonify({'error': 'Flowchart not found'}), 404
        
        # Delete flowchart
        conn.execute('DELETE FROM flowcharts WHERE id = ?', (flowchart_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'Flowchart deleted successfully'})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/templates', methods=['GET'])
def get_templates():
    """Get all flowchart templates"""
    try:
        category = request.args.get('category', '')
        
        conn = get_db_connection()
        
        if category:
            templates = conn.execute('''
                SELECT * FROM templates WHERE category = ? ORDER BY name
            ''', (category,)).fetchall()
        else:
            templates = conn.execute('''
                SELECT * FROM templates ORDER BY category, name
            ''').fetchall()
        
        conn.close()
        
        result = []
        for template in templates:
            template_dict = dict(template)
            template_dict['data'] = json.loads(template_dict['data'])
            result.append(template_dict)
        
        return jsonify({'templates': result})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/templates', methods=['POST'])
def create_template():
    """Create a new template"""
    try:
        data = request.json
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({'error': 'Name is required'}), 400
        
        if not data.get('data'):
            return jsonify({'error': 'Template data is required'}), 400
        
        template_id = str(uuid.uuid4())
        template_data = json.dumps(data['data'])
        
        conn = get_db_connection()
        conn.execute('''
            INSERT INTO templates (id, name, description, data, category)
            VALUES (?, ?, ?, ?, ?)
        ''', (template_id, data['name'], data.get('description', ''), 
              template_data, data.get('category', 'general')))
        conn.commit()
        conn.close()
        
        return jsonify({
            'id': template_id,
            'message': 'Template created successfully'
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/flowcharts/<flowchart_id>/export', methods=['GET'])
def export_flowchart(flowchart_id):
    """Export flowchart data"""
    try:
        format_type = request.args.get('format', 'json').lower()
        
        conn = get_db_connection()
        flowchart = conn.execute('''
            SELECT * FROM flowcharts WHERE id = ?
        ''', (flowchart_id,)).fetchone()
        conn.close()
        
        if not flowchart:
            return jsonify({'error': 'Flowchart not found'}), 404
        
        flowchart_dict = dict(flowchart)
        flowchart_dict['data'] = json.loads(flowchart_dict['data'])
        
        if format_type == 'json':
            return jsonify(flowchart_dict)
        else:
            return jsonify({'error': 'Unsupported format'}), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/flowcharts/import', methods=['POST'])
def import_flowchart():
    """Import flowchart from JSON data"""
    try:
        data = request.json
        
        # Validate imported data structure
        if not data.get('name') or not data.get('data'):
            return jsonify({'error': 'Invalid flowchart data format'}), 400
        
        # Generate new ID for imported flowchart
        flowchart_id = str(uuid.uuid4())
        flowchart_data = json.dumps(data['data'])
        
        # Add suffix to name if importing
        name = f"{data['name']} (Imported)"
        
        conn = get_db_connection()
        conn.execute('''
            INSERT INTO flowcharts (id, name, description, data)
            VALUES (?, ?, ?, ?)
        ''', (flowchart_id, name, data.get('description', ''), flowchart_data))
        conn.commit()
        conn.close()
        
        return jsonify({
            'id': flowchart_id,
            'message': 'Flowchart imported successfully'
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/search', methods=['GET'])
def search_flowcharts():
    """Search flowcharts by name or description"""
    try:
        query = request.args.get('q', '').strip()
        if not query:
            return jsonify({'error': 'Search query is required'}), 400
        
        conn = get_db_connection()
        flowcharts = conn.execute('''
            SELECT id, name, description, created_at, updated_at 
            FROM flowcharts 
            WHERE name LIKE ? OR description LIKE ?
            ORDER BY updated_at DESC
        ''', (f'%{query}%', f'%{query}%')).fetchall()
        conn.close()
        
        return jsonify({
            'flowcharts': [dict(row) for row in flowcharts],
            'query': query
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({'error': 'Method not allowed'}), 405

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

# Seed some example templates on first run
def seed_templates():
    """Add some example templates to the database"""
    conn = get_db_connection()
    
    # Check if templates already exist
    count = conn.execute('SELECT COUNT(*) FROM templates').fetchone()[0]
    if count > 0:
        conn.close()
        return
    
    # Basic flowchart template
    basic_template = {
        'nodes': [
            {
                'id': 'start-1',
                'type': 'circle',
                'x': 100,
                'y': 100,
                'width': 80,
                'height': 80,
                'text': 'Start',
                'color': '#10b981',
                'textColor': '#ffffff',
                'borderColor': '#047857',
                'borderWidth': 2
            },
            {
                'id': 'process-1',
                'type': 'rectangle',
                'x': 100,
                'y': 220,
                'width': 120,
                'height': 60,
                'text': 'Process',
                'color': '#3b82f6',
                'textColor': '#ffffff',
                'borderColor': '#1e40af',
                'borderWidth': 2
            },
            {
                'id': 'end-1',
                'type': 'circle',
                'x': 100,
                'y': 340,
                'width': 80,
                'height': 80,
                'text': 'End',
                'color': '#ef4444',
                'textColor': '#ffffff',
                'borderColor': '#dc2626',
                'borderWidth': 2
            }
        ],
        'connections': [
            {
                'id': 'conn-1',
                'from': 'start-1',
                'to': 'process-1',
                'color': '#374151',
                'width': 2,
                'arrowSize': 8
            },
            {
                'id': 'conn-2',
                'from': 'process-1',
                'to': 'end-1',
                'color': '#374151',
                'width': 2,
                'arrowSize': 8
            }
        ]
    }
    
    # Decision tree template
    decision_template = {
        'nodes': [
            {
                'id': 'start-1',
                'type': 'circle',
                'x': 200,
                'y': 50,
                'width': 80,
                'height': 80,
                'text': 'Start',
                'color': '#10b981',
                'textColor': '#ffffff',
                'borderColor': '#047857',
                'borderWidth': 2
            },
            {
                'id': 'decision-1',
                'type': 'diamond',
                'x': 170,
                'y': 170,
                'width': 140,
                'height': 100,
                'text': 'Decision?',
                'color': '#f59e0b',
                'textColor': '#ffffff',
                'borderColor': '#d97706',
                'borderWidth': 2
            },
            {
                'id': 'yes-1',
                'type': 'rectangle',
                'x': 50,
                'y': 320,
                'width': 100,
                'height': 60,
                'text': 'Yes Path',
                'color': '#3b82f6',
                'textColor': '#ffffff',
                'borderColor': '#1e40af',
                'borderWidth': 2
            },
            {
                'id': 'no-1',
                'type': 'rectangle',
                'x': 330,
                'y': 320,
                'width': 100,
                'height': 60,
                'text': 'No Path',
                'color': '#3b82f6',
                'textColor': '#ffffff',
                'borderColor': '#1e40af',
                'borderWidth': 2
            }
        ],
        'connections': [
            {
                'id': 'conn-1',
                'from': 'start-1',
                'to': 'decision-1',
                'color': '#374151',
                'width': 2,
                'arrowSize': 8
            },
            {
                'id': 'conn-2',
                'from': 'decision-1',
                'to': 'yes-1',
                'color': '#374151',
                'width': 2,
                'arrowSize': 8
            },
            {
                'id': 'conn-3',
                'from': 'decision-1',
                'to': 'no-1',
                'color': '#374151',
                'width': 2,
                'arrowSize': 8
            }
        ]
    }
    
    templates = [
        ('basic-flow', 'Basic Flow', 'Simple start-process-end flow', json.dumps(basic_template), 'basic'),
        ('decision-tree', 'Decision Tree', 'Decision-making flowchart template', json.dumps(decision_template), 'business')
    ]
    
    conn.executemany('''
        INSERT INTO templates (id, name, description, data, category)
        VALUES (?, ?, ?, ?, ?)
    ''', templates)
    
    conn.commit()
    conn.close()

if __name__ == '__main__':
    # Initialize database and seed templates
    init_db()
    seed_templates()
    
    # Run the Flask app
    app.run(debug=True, host='0.0.0.0', port=5000)