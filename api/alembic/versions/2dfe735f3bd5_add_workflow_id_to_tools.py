"""add_workflow_id_to_tools

Adds optional agent scoping to tools: NULL workflow_id = org-global tool,
set = visible only in that workflow's tool picker. CASCADE so deleting a
workflow removes its private tools.

Revision ID: 2dfe735f3bd5
Revises: 91cc6ba3e1c7
Create Date: 2026-07-02 14:28:41.744152

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '2dfe735f3bd5'
down_revision: Union[str, None] = '91cc6ba3e1c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tools', sa.Column('workflow_id', sa.Integer(), nullable=True))
    op.create_index('ix_tools_workflow_id', 'tools', ['workflow_id'], unique=False)
    op.create_foreign_key(
        'fk_tools_workflow_id_workflows',
        'tools',
        'workflows',
        ['workflow_id'],
        ['id'],
        ondelete='CASCADE',
    )


def downgrade() -> None:
    op.drop_constraint('fk_tools_workflow_id_workflows', 'tools', type_='foreignkey')
    op.drop_index('ix_tools_workflow_id', table_name='tools')
    op.drop_column('tools', 'workflow_id')
